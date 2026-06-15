-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  028_parc_categories_equipements.sql                                        ║
-- ║  Suite de 027 : structure + bascule des données vers le scope `parc`.       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
--
-- Doit s'exécuter APRÈS 027 (valeur d'enum `parc` committée). Contenu :
--   1. check_categorie_parent_scope : `parc` se comporte comme `gamme`/`mixte`
--      (catégorie → sous-catégorie, 2 niveaux max).
--   2. check_equipement_categorie_scope : un équipement se range UNIQUEMENT dans
--      une catégorie `parc` (séparée des catégories de modèles, scope 'equipement').
--   3. instancier_equipement : nouveau paramètre `p_categorie_id` → l'équipement
--      créé depuis un modèle se range dans la (sous-)catégorie de parc choisie
--      (le modèle, lui, est sur scope 'equipement' : sa catégorie n'est plus copiée).
--   4. Backfill PRÉSERVATION : recrée les catégories du parc à l'identique (par
--      site) et rebranche les équipements existants — aucun classement perdu.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Profondeur des catégories : `parc` calqué sur `gamme`/`mixte` (2 niveaux).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_categorie_parent_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    p_site   UUID;
    p_scope  public.categorie_scope;
    p_parent UUID;
BEGIN
    -- 1 niveau equipement/operation — verrou aussi sur changement de scope.
    IF NEW.scope IN ('equipement', 'operation') AND EXISTS (
        SELECT 1 FROM public.categories e
         WHERE e.parent_id = NEW.id
           AND e.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégories (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Anti-promotion en racine d'une (sous-)catégorie portant des gammes.
    IF NEW.parent_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.gammes g
             WHERE g.categorie_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Impossible de promouvoir cette catégorie en racine : des gammes (y compris en corbeille) y sont rangées (une gamme doit rester dans une sous-catégorie) — réassignez-les d''abord.'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    SELECT site_id, scope, parent_id
      INTO p_site, p_scope, p_parent
      FROM public.categories WHERE id = NEW.parent_id;

    -- 1 niveau pour equipement/operation : ne peuvent pas servir de parent.
    IF p_scope IN ('equipement', 'operation') THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégorie (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2 niveaux pour gamme/mixte/parc : pas de parent qui est lui-même un enfant
    -- (profondeur > 2). Arborescence cible : catégorie (racine) → sous-catégorie → feuille.
    IF NEW.scope IN ('gamme', 'mixte', 'parc') AND p_parent IS NOT NULL THEN
        RAISE EXCEPTION 'Une catégorie de gamme/mixte/parc ne peut pas dépasser 2 niveaux (catégorie racine → sous-catégorie).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2 niveaux — verrou côté ANCÊTRE : une catégorie gamme/mixte/parc qui DEVIENT
    -- une sous-catégorie (niveau ≥2) ne peut pas avoir d'enfant vivant.
    IF NEW.scope IN ('gamme', 'mixte', 'parc') AND NEW.parent_id IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.categories enfant
            WHERE enfant.parent_id = NEW.id
              AND enfant.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION 'Une sous-catégorie de gamme/mixte/parc ne peut pas avoir d''enfants : re-parentage interdit (créerait un niveau 3).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Parent site-scopé : l'enfant doit être sur le même site.
    IF p_site IS NOT NULL AND NEW.site_id IS DISTINCT FROM p_site THEN
        RAISE EXCEPTION 'Catégorie enfant hors scope du parent site (parent_site=%, enfant_site=%)',
            p_site, NEW.site_id;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_categorie_parent_scope() IS 'Cohérence parent : (1) enfant jamais plus large que son parent ; (2) equipement/operation = 1 niveau (racine-only) ; (3) gamme/mixte/parc = 2 niveaux max (catégorie → sous-catégorie) ; (4) une sous-catégorie gamme/mixte/parc ne peut pas avoir d''enfants ; (5) pas de promotion en racine d''une catégorie portant des gammes. SECURITY DEFINER. (028 : scope ''parc'' = catégories des équipements réels, traité comme ''gamme''.)';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Un équipement se range UNIQUEMENT dans une catégorie de parc.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_equipement_categorie_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_scope      public.categorie_scope;
    c_site       UUID;
    eq_site      UUID;
BEGIN
    IF NEW.categorie_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT scope, site_id INTO c_scope, c_site
    FROM public.categories WHERE id = NEW.categorie_id;

    -- Scope d'usage : catégorie de PARC obligatoire (séparée des modèles).
    IF c_scope <> 'parc' THEN
        RAISE EXCEPTION 'Catégorie % de scope ''%'' : un équipement se range dans une catégorie de parc (scope ''parc'').', NEW.categorie_id, c_scope
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cohérence site (catégorie de parc toujours scopée site).
    IF c_site IS NOT NULL THEN
        SELECT s.id INTO eq_site
        FROM public.locaux    l
        JOIN public.niveaux   n ON n.id = l.niveau_id
        JOIN public.batiments b ON b.id = n.batiment_id
        JOIN public.sites     s ON s.id = b.site_id
        WHERE l.id = NEW.local_id;

        IF eq_site IS DISTINCT FROM c_site THEN
            RAISE EXCEPTION 'Catégorie % scopée site % mais équipement sur site %',
                NEW.categorie_id, c_site, eq_site;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_equipement_categorie_scope() IS 'Un équipement réel se range uniquement dans une catégorie de PARC (scope ''parc'', séparée des catégories de modèles) et sur le même site que son local.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. instancier_equipement : la catégorie de l'équipement est désormais celle du
--    PARC choisie (p_categorie_id), pas celle du modèle (scope 'equipement').
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.instancier_equipement(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.instancier_equipement(
    p_modele_id        UUID,
    p_local_id         UUID,
    p_code_inventaire  TEXT,
    p_categorie_id     UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role        TEXT := public.current_role();
    v_modele      public.modeles_equipements%ROWTYPE;
    v_local_site  UUID;
    v_new_id      UUID;
BEGIN
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'instancier_equipement : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_role NOT IN ('admin', 'manager', 'technicien') THEN
        RAISE EXCEPTION 'instancier_equipement : rôle % non autorisé.', v_role
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT s.id INTO v_local_site
      FROM public.locaux    l
      JOIN public.niveaux   n ON n.id = l.niveau_id
      JOIN public.batiments b ON b.id = n.batiment_id
      JOIN public.sites     s ON s.id = b.site_id
     WHERE l.id = p_local_id AND l.deleted_at IS NULL;

    IF v_local_site IS NULL THEN
        RAISE EXCEPTION 'instancier_equipement : local % introuvable ou hiérarchie spatiale incomplète.', p_local_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_role <> 'admin' AND NOT public.has_site_access(v_local_site) THEN
        RAISE EXCEPTION 'instancier_equipement : accès refusé au local cible.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_modele
      FROM public.modeles_equipements
     WHERE id = p_modele_id
       AND deleted_at IS NULL
       AND est_actif = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'instancier_equipement : modèle % introuvable, archivé ou en corbeille.', p_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- Le front ne propose que des modèles DU SITE (l'export commun → site se fait
    -- dans la Bibliothèque). On garde néanmoins la garde scope par sécurité.
    IF v_modele.site_id IS NOT NULL AND v_modele.site_id IS DISTINCT FROM v_local_site THEN
        RAISE EXCEPTION 'instancier_equipement : modèle incompatible avec le site du local cible.'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Copie PAR VALEUR du modèle (specs, image, nom). La catégorie vient du PARC
    -- (p_categorie_id) — NULL = « Non classé ». Le trigger check_equipement_categorie_scope
    -- valide qu'elle est bien de scope 'parc' et sur le bon site.
    INSERT INTO public.equipements (
        id, local_id, categorie_id,
        nom, code_inventaire,
        specifications, image_path,
        copie_depuis_modele_id
    ) VALUES (
        gen_random_uuid(), p_local_id, p_categorie_id,
        v_modele.nom, p_code_inventaire,
        v_modele.specifications, v_modele.image_path,
        p_modele_id
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.instancier_equipement(UUID, UUID, TEXT, UUID) IS
    'Crée un équipement réel à partir d''un modèle (copie PAR VALEUR — snapshot). L''équipement est indépendant du modèle après création. La catégorie vient du PARC (p_categorie_id, scope ''parc'' ; NULL = Non classé), pas du modèle. Droits : admin/manager/technicien ayant accès au site du local. Modèle vivant + actif ; si scope site, doit cibler le site du local.';

-- Posture de sécurité (calque du durcissement global) : pas d'EXECUTE implicite
-- pour PUBLIC/anon sur une fonction SECURITY DEFINER ; uniquement authenticated +
-- service_role (l'auth réelle est vérifiée dans le corps via current_role()).
REVOKE EXECUTE ON FUNCTION public.instancier_equipement(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.instancier_equipement(uuid, uuid, text, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Backfill PRÉSERVATION : recrée les catégories du parc et rebranche les
--    équipements existants (idempotent).
-- ───────────────────────────────────────────────────────────────────────────

-- 4a. Créer les catégories 'parc' manquantes (une par site + nom utilisé par des
--     équipements, sur le site DÉRIVÉ du local de l'équipement).
INSERT INTO public.categories (nom, scope, site_id, parent_id, ordre, est_actif)
SELECT DISTINCT c.nom, 'parc'::public.categorie_scope, s.id, NULL::uuid, 0::smallint, true
  FROM public.equipements e
  JOIN public.categories c ON c.id = e.categorie_id
  JOIN public.locaux     l ON l.id = e.local_id
  JOIN public.niveaux    n ON n.id = l.niveau_id
  JOIN public.batiments  b ON b.id = n.batiment_id
  JOIN public.sites      s ON s.id = b.site_id
 WHERE e.deleted_at IS NULL
   AND c.scope <> 'parc'
   AND NOT EXISTS (
       SELECT 1 FROM public.categories p
        WHERE p.scope = 'parc'
          AND p.site_id = s.id
          AND lower(p.nom) = lower(c.nom)
          AND p.deleted_at IS NULL
   );

-- 4b. Rebrancher chaque équipement vers la catégorie 'parc' équivalente
--     (même site dérivé, même nom). Le trigger valide scope 'parc' + cohérence site.
UPDATE public.equipements e
   SET categorie_id = p.id
  FROM public.categories c,
       public.locaux     l,
       public.niveaux    n,
       public.batiments  b,
       public.sites      s,
       public.categories p
 WHERE e.categorie_id = c.id
   AND c.scope <> 'parc'
   AND l.id = e.local_id
   AND n.id = l.niveau_id
   AND b.id = n.batiment_id
   AND s.id = b.site_id
   AND p.scope = 'parc'
   AND p.site_id = s.id
   AND lower(p.nom) = lower(c.nom)
   AND p.deleted_at IS NULL
   AND e.deleted_at IS NULL;
