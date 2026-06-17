-- =============================================================================
-- Migration 036 — Suppression DÉFINITIVE du soft-delete (colonne deleted_at)
-- =============================================================================
-- Objectif : retirer la colonne deleted_at de toutes les tables qui la portent,
-- ainsi que TOUT objet qui la référence encore (vues, fonctions, index).
-- Les garde-fous d'intégrité (FK RESTRICT, BEFORE DELETE métier) sont CONSERVÉS.
-- AUCUNE cascade : on traite chaque dépendance explicitement avant le DROP COLUMN.
--
-- Prérequis déjà déployés (NON refaits ici) :
--   * 034 : purge physique des lignes deleted_at IS NOT NULL (sauf 5 catégories
--           résiduelles qui « ressuscitent » au DROP COLUMN — comportement voulu).
--   * 035 : suppression des triggers/fonctions de cascade corbeille + cron de purge,
--           adaptation de protection_ot_terminaux et detacher_et_supprimer_modele_operation,
--           ajout de cleanup_document_blob. Ces objets NE sont PAS retouchés ici.
--
-- TODO / point d'incohérence à connaître (voir warnings) :
--   La vue v_equipements_complet est définie en « SELECT e.* » (lignes 1948 et 5809
--   de schema_complete.sql). Un simple CREATE OR REPLACE sans deleted_at NE suffit PAS
--   à lever la dépendance : e.* fige la liste de colonnes incluant deleted_at tant que
--   la colonne existe, ce qui ferait échouer ALTER TABLE equipements DROP COLUMN
--   (sauf CASCADE, refusé). On la DROP donc AVANT le DROP COLUMN puis on la RECRÉE
--   APRÈS (étape 6 bis), où e.* n'expose plus deleted_at.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. (BEGIN ci-dessus)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 2. Catégories « ressuscitées » : anti-collision sur la clé d'unicité PLEINE
-- -----------------------------------------------------------------------------
-- Au DROP COLUMN, les catégories encore en corbeille (deleted_at IS NOT NULL)
-- redeviennent visibles et tombent sous l'index unique uq_categories_nom recréé
-- en version PLEINE (clé : COALESCE(site_id), COALESCE(parent_id), scope, lower(nom)).
-- L'ancien index partiel (WHERE deleted_at IS NULL) tolérait des DOUBLONS entre
-- lignes en corbeille : on dédoublonne donc ressuscitée-vs-N'IMPORTE-QUELLE-autre
-- ligne de même clé (vivante OU ressuscitée), pas seulement vs vivante. Le suffixe
-- intègre l'id complet de la ligne → unicité GARANTIE (aucune autre ligne ne peut
-- porter ce suffixe), donc deux sœurs homonymes renommées ne re-collisionnent pas.
-- Les lignes vivantes ne sont jamais renommées (filtre deleted_at IS NOT NULL).
UPDATE categories AS c
SET nom = c.nom || ' (restauré ' || c.id::text || ')'
WHERE c.deleted_at IS NOT NULL
  AND EXISTS (
        SELECT 1
        FROM categories AS o
        WHERE o.id <> c.id
          AND COALESCE(o.site_id::text,   'ALL_SITES') = COALESCE(c.site_id::text,   'ALL_SITES')
          AND COALESCE(o.parent_id::text, 'ROOT')      = COALESCE(c.parent_id::text, 'ROOT')
          AND o.scope = c.scope
          AND lower(o.nom) = lower(c.nom)
      );

-- -----------------------------------------------------------------------------
-- 3. Vues simplifiées (sans deleted_at) AVANT le DROP COLUMN
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE pour les vues à colonnes explicites : retirer les filtres
-- deleted_at lève la dépendance sur la colonne sans changer la liste de sortie
-- (security_invoker + GRANT conservés). v_equipements_complet est traitée à part
-- (DROP ici, recréation après le DROP COLUMN — cf. TODO en tête).

-- 3.a — v_locaux_chemin (dépendance de v_equipements_complet : recréée en premier)
CREATE OR REPLACE VIEW v_locaux_chemin AS
SELECT
    l.id               AS local_id,
    s.id               AS site_id,
    b.id               AS batiment_id,
    n.id               AS niveau_id,
    s.nom              AS site_nom,
    b.nom              AS batiment_nom,
    n.nom              AS niveau_nom,
    l.nom              AS local_nom,
    l.type_local_id    AS type_local_id,
    tl.libelle         AS type_local,
    -- chemin complet (toujours non ambigu)
    s.nom || ' / ' || b.nom || ' / ' || n.nom || ' / ' || l.nom AS chemin_complet,
    -- chemin court : on omet le site si l'entreprise n'en a qu'un seul
    CASE
        WHEN (
            SELECT count(*) FROM sites s2
        ) = 1
            THEN b.nom || ' / ' || n.nom || ' / ' || l.nom
        ELSE     s.nom || ' / ' || b.nom || ' / ' || n.nom || ' / ' || l.nom
    END AS chemin_court
FROM locaux l
JOIN niveaux   n ON n.id = l.niveau_id
JOIN batiments b ON b.id = n.batiment_id
JOIN sites     s ON s.id = b.site_id
LEFT JOIN types_locaux tl ON tl.id = l.type_local_id;

-- 3.b — v_niveaux_surface (CREATE -> CREATE OR REPLACE : la vue existe déjà en prod)
CREATE OR REPLACE VIEW v_niveaux_surface AS
SELECT
    n.id                            AS niveau_id,
    n.batiment_id,
    COALESCE(SUM(l.surface_m2), 0)  AS surface_m2,
    COALESCE(SUM(l.surface_m2) FILTER (WHERE l.chauffe_climatise), 0) AS surface_chauffee_m2
FROM niveaux n
LEFT JOIN locaux l ON l.niveau_id = n.id
GROUP BY n.id, n.batiment_id;
ALTER VIEW v_niveaux_surface SET (security_invoker = true);
GRANT SELECT ON v_niveaux_surface TO anon, authenticated;

-- 3.c — v_batiments_surface (CREATE -> CREATE OR REPLACE : la vue existe déjà en prod)
CREATE OR REPLACE VIEW v_batiments_surface AS
SELECT
    b.id                            AS batiment_id,
    b.site_id,
    COALESCE(SUM(l.surface_m2), 0)  AS surface_m2,
    COALESCE(SUM(l.surface_m2) FILTER (WHERE l.chauffe_climatise), 0) AS surface_chauffee_m2
FROM batiments b
LEFT JOIN niveaux n ON n.batiment_id = b.id
LEFT JOIN locaux  l ON l.niveau_id = n.id
GROUP BY b.id, b.site_id;
ALTER VIEW v_batiments_surface SET (security_invoker = true);
GRANT SELECT ON v_batiments_surface TO anon, authenticated;

-- 3.d — v_registre_securite (CREATE -> CREATE OR REPLACE : la vue existe déjà en prod)
CREATE OR REPLACE VIEW v_registre_securite AS
-- 1. OT de contrôle réglementaire clôturés
SELECT
    ot.site_id,
    ot.id                              AS ref_id,
    'ot_controle'::text                AS type_ligne,
    ot.date_cloture::date              AS date_ligne,
    ot.nom_gamme                       AS objet,
    NULL::observation_gravite          AS gravite,
    NULL::observation_statut           AS statut,
    NULL::date                         AS echeance,
    ot.nom_prestataire                 AS intervenant
FROM ordres_travail ot
WHERE ot.statut = 'cloture'
  AND ot.nature_gamme = 'controle_reglementaire'

UNION ALL

-- 2. Observations (toutes sources, tous statuts)
SELECT
    o.site_id,
    o.id                                                AS ref_id,
    ('observation_' || o.source::text)                  AS type_ligne,
    COALESCE(o.date_levee, o.created_at::date)          AS date_ligne,
    o.description                                       AS objet,
    o.gravite,
    o.statut,
    o.echeance,
    NULL::text                                          AS intervenant
FROM observations o
;

-- 3.e — v_miniatures_pool
CREATE OR REPLACE VIEW public.v_miniatures_pool AS
WITH refs AS (
    SELECT miniature_id, 'equipement'::text AS origine, nom AS libelle
      FROM public.modeles_equipements
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'equipement', nom
      FROM public.equipements
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'equipement', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL
       AND scope IN ('equipement', 'mixte')
    UNION ALL
    SELECT miniature_id, 'operation', nom
      FROM public.modeles_operations
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'operation', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL
       AND scope = 'operation'
    UNION ALL
    SELECT miniature_id, 'plan_maintenance', nom
      FROM public.gammes
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'plan_maintenance', nom
      FROM public.categories
     WHERE miniature_id IS NOT NULL
       AND scope IN ('gamme', 'mixte')
    UNION ALL
    SELECT miniature_id, 'di', libelle
      FROM public.modeles_di
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'lieux', libelle
      FROM public.prestataires
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.batiments
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.niveaux
     WHERE miniature_id IS NOT NULL
    UNION ALL
    SELECT miniature_id, 'lieux', nom
      FROM public.locaux
     WHERE miniature_id IS NOT NULL
),
agg AS (
    SELECT miniature_id,
           array_agg(DISTINCT origine ORDER BY origine) AS origines,
           string_agg(DISTINCT libelle, ' ')            AS libelles
      FROM refs
     GROUP BY miniature_id
)
SELECT
    m.id,
    m.site_id,
    m.hash_sha256,
    m.storage_path,
    m.created_at,
    m.created_by,
    COALESCE(a.origines, ARRAY[]::text[]) AS origines,
    COALESCE(a.libelles, '')             AS libelles
  FROM public.miniatures m
  LEFT JOIN agg a ON a.miniature_id = m.id;
ALTER VIEW public.v_miniatures_pool SET (security_invoker = true);
GRANT SELECT ON public.v_miniatures_pool TO anon, authenticated;

-- 3.f — v_equipements_complet : DROP ici (SELECT e.* fige deleted_at tant que la
--        colonne existe). La vue est RECRÉÉE à l'étape 6 bis, après le DROP COLUMN.
DROP VIEW public.v_equipements_complet;

-- -----------------------------------------------------------------------------
-- 4. Fonctions corrigées (retrait des références deleted_at)
-- -----------------------------------------------------------------------------
-- 18 fonctions recréées (CREATE OR REPLACE). Signatures, SECURITY et search_path
-- inchangés. Les corps PL/pgSQL ne bloquent pas le DROP COLUMN (texte validé à
-- l'exécution) mais casseraient au 1er appel s'ils n'étaient pas corrigés.

-- 4.1 — handle_new_auth_user
CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = ''
AS $$
DECLARE
    v_meta        JSONB;
    v_role        TEXT;
    v_nom         TEXT;
    v_created_by  UUID;
    v_site_ids    UUID[];
    v_site_id     UUID;
    v_inviter_role TEXT;
BEGIN
    v_meta := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
              || COALESCE(NEW.raw_app_meta_data, '{}'::jsonb);

    IF NULLIF(v_meta->>'role', '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.roles WHERE code = v_meta->>'role') THEN
        RAISE EXCEPTION 'Rôle « % » invalide. Rôles valides : voir public.roles (admin, manager, technicien, lecteur, demandeur).',
            v_meta->>'role'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_role      := NULLIF(v_meta->>'role', '');
    v_nom       := COALESCE(
                       NULLIF(v_meta->>'nom_complet', ''),
                       NEW.email,
                       'Sans nom'
                   );
    v_created_by := NULLIF(v_meta->>'created_by', '')::UUID;
    IF v_meta ? 'site_ids' THEN
        SELECT array_agg(value::TEXT::UUID)
        INTO   v_site_ids
        FROM   jsonb_array_elements_text(v_meta->'site_ids') AS value
        WHERE  value IS NOT NULL AND value <> '';
    END IF;

    IF v_role IS NULL THEN
        RAISE EXCEPTION
            'handle_new_auth_user : role manquant pour user % — création via Edge Function service_role obligatoire.',
            NEW.id
            USING ERRCODE = 'not_null_violation';
    END IF;

    IF v_created_by IS NULL THEN
        IF EXISTS (SELECT 1 FROM public.users u JOIN public.roles r ON r.id = u.role_id WHERE r.code = 'admin') THEN
            RAISE EXCEPTION
                'handle_new_auth_user : un admin existe déjà — création sans created_by réservée au tout premier admin (bootstrap Dashboard).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    IF v_created_by IS NOT NULL THEN
        SELECT r.code INTO v_inviter_role
        FROM public.users u
        JOIN public.roles r ON r.id = u.role_id
        WHERE u.id = v_created_by AND u.est_actif = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'handle_new_auth_user : created_by % introuvable ou inactif',
                v_created_by
                USING ERRCODE = 'foreign_key_violation';
        END IF;

        IF NOT (
            (v_inviter_role = 'admin')
            OR (v_inviter_role = 'manager'    AND v_role IN ('technicien', 'lecteur', 'demandeur'))
            OR (v_inviter_role = 'technicien' AND v_role IN ('lecteur', 'demandeur'))
        ) THEN
            RAISE EXCEPTION
                'handle_new_auth_user : un % ne peut pas créer un %',
                v_inviter_role, v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    INSERT INTO public.users (id, role_id, nom_complet, est_actif, created_by)
    VALUES (NEW.id, (SELECT id FROM public.roles WHERE code = v_role), v_nom, true, v_created_by);

    IF v_site_ids IS NOT NULL AND array_length(v_site_ids, 1) > 0 THEN
        FOREACH v_site_id IN ARRAY v_site_ids LOOP
            -- Vérification existence du site
            IF NOT EXISTS (
                SELECT 1 FROM public.sites
                WHERE id = v_site_id
            ) THEN
                RAISE EXCEPTION
                    'handle_new_auth_user : site_id % introuvable',
                    v_site_id
                    USING ERRCODE = 'foreign_key_violation';
            END IF;

            IF v_inviter_role IS NOT NULL
               AND v_inviter_role <> 'admin'
               AND NOT EXISTS (
                   SELECT 1 FROM public.user_sites
                   WHERE user_id = v_created_by AND site_id = v_site_id
               )
            THEN
                RAISE EXCEPTION
                    'handle_new_auth_user : l''inviteur n''a pas accès au site %',
                    v_site_id
                    USING ERRCODE = 'insufficient_privilege';
            END IF;

            INSERT INTO public.user_sites (user_id, site_id)
            VALUES (NEW.id, v_site_id);
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

-- 4.2 — get_my_sites
CREATE OR REPLACE FUNCTION public.get_my_sites()
RETURNS SETOF public.sites
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT s.*
    FROM public.sites s
    WHERE (
          EXISTS (
              SELECT 1 FROM public.users u
              WHERE u.id = (SELECT auth.uid())
                AND u.role_id = (SELECT id FROM public.roles WHERE code = 'admin')
                AND u.est_actif = true
          )
          OR EXISTS (
              SELECT 1
              FROM public.user_sites us
              JOIN public.users u ON u.id = us.user_id
              WHERE us.user_id = (SELECT auth.uid())
                AND us.site_id = s.id
                AND u.est_actif = true
          )
      );
$$;

-- 4.3 — check_categorie_parent_scope
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
    -- 1 niveau equipement/operation : toujours racine -> pas de sous-catégorie.
    IF NEW.scope IN ('equipement', 'operation') AND EXISTS (
        SELECT 1 FROM public.categories e
         WHERE e.parent_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégories (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Anti-promotion en racine : une sous-catégorie portant des gammes ne peut
    -- pas être promue en racine (une gamme doit rester dans une sous-catégorie).
    IF NEW.parent_id IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.gammes g
             WHERE g.categorie_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'Impossible de promouvoir cette catégorie en racine : des gammes y sont rangées (une gamme doit rester dans une sous-catégorie) — réassignez-les d''abord.'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    SELECT site_id, scope, parent_id
      INTO p_site, p_scope, p_parent
      FROM public.categories WHERE id = NEW.parent_id;

    IF p_scope IN ('equipement', 'operation') THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégorie (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.scope IN ('gamme', 'mixte', 'parc') AND p_parent IS NOT NULL THEN
        RAISE EXCEPTION 'Une catégorie de gamme/mixte/parc ne peut pas dépasser 2 niveaux (catégorie racine → sous-catégorie).'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.scope IN ('gamme', 'mixte', 'parc') AND NEW.parent_id IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.categories enfant
            WHERE enfant.parent_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'Une sous-catégorie de gamme/mixte/parc ne peut pas avoir d''enfants : re-parentage interdit (créerait un niveau 3).'
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_site IS NOT NULL AND NEW.site_id IS DISTINCT FROM p_site THEN
        RAISE EXCEPTION 'Catégorie enfant hors scope du parent site (parent_site=%, enfant_site=%)',
            p_site, NEW.site_id;
    END IF;

    RETURN NEW;
END;
$$;

-- 4.4 — check_categorie_modele
CREATE OR REPLACE FUNCTION public.check_categorie_modele()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    m_site     UUID;
    m_exists   BOOLEAN;
BEGIN
    IF NEW.modele_equipement_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.scope <> 'parc' THEN
        RAISE EXCEPTION 'Un modèle ne peut être fixé que sur une catégorie de parc (scope ''parc'').'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT true, site_id
      INTO m_exists, m_site
      FROM public.modeles_equipements
     WHERE id = NEW.modele_equipement_id;

    IF m_exists IS NULL THEN
        RAISE EXCEPTION 'Modèle % introuvable.', NEW.modele_equipement_id
            USING ERRCODE = 'check_violation';
    END IF;
    IF m_site IS NULL OR m_site IS DISTINCT FROM NEW.site_id THEN
        RAISE EXCEPTION 'Le modèle fixé doit être un modèle de CE site (exporte d''abord un modèle commun vers le site).'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- 4.5 — instancier_equipement
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
     WHERE l.id = p_local_id;

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
       AND est_actif = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'instancier_equipement : modèle % introuvable ou archivé.', p_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_modele.site_id IS NOT NULL AND v_modele.site_id IS DISTINCT FROM v_local_site THEN
        RAISE EXCEPTION 'instancier_equipement : modèle incompatible avec le site du local cible.'
            USING ERRCODE = 'check_violation';
    END IF;

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

-- 4.6 — copier_modele_equipement
CREATE OR REPLACE FUNCTION public.copier_modele_equipement(
    p_source_modele_id UUID,
    p_site_cible       UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role   TEXT := public.current_role();
    v_source public.modeles_equipements%ROWTYPE;
    v_new_id UUID;
BEGIN
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_equipement : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION 'copier_modele_equipement : seuls admin et manager peuvent copier vers la bibliothèque entreprise.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        IF v_role = 'admin' THEN
            NULL;
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION 'copier_modele_equipement : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION 'copier_modele_equipement : rôle % non autorisé.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    SELECT * INTO v_source
      FROM public.modeles_equipements
     WHERE id = p_source_modele_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_equipement : modèle source % introuvable.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_equipement : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.categories
         WHERE id = v_source.categorie_id
    ) THEN
        v_source.categorie_id := public.copier_categorie_noeud(
            v_source.categorie_id, NULL, p_site_cible
        );
    ELSE
        SELECT id INTO v_source.categorie_id
          FROM public.categories
         WHERE site_id IS NULL AND parent_id IS NULL
           AND scope = 'equipement'
           AND lower(nom) = 'non classé (équipements)'
         LIMIT 1;
        IF v_source.categorie_id IS NULL THEN
            RAISE EXCEPTION 'copier_modele_equipement : catégorie de secours « Non classé (équipements) » introuvable — recréez-la avant de copier.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    INSERT INTO public.modeles_equipements (
        id, site_id, nom, description, image_path, miniature_id,
        categorie_id, specifications, est_actif, created_by
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        v_source.nom, v_source.description, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        v_source.categorie_id, v_source.specifications,
        true, (SELECT auth.uid())
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- 4.7 — protect_prestataire_interne_update (retrait de la branche anti-soft-delete,
--        garde-fou du flag est_interne conservé)
CREATE OR REPLACE FUNCTION public.protect_prestataire_interne_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.est_interne <> NEW.est_interne THEN
        RAISE EXCEPTION 'Le flag est_interne d''un prestataire ne peut pas être modifié après création.'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- 4.8 — copier_modele_operation
CREATE OR REPLACE FUNCTION public.copier_modele_operation(
    p_source_modele_id UUID,
    p_site_cible       UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role   TEXT := public.current_role();
    v_source public.modeles_operations%ROWTYPE;
    v_new_id UUID;
BEGIN
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_operation : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION 'copier_modele_operation : seuls admin et manager peuvent copier vers la bibliothèque entreprise.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        IF v_role = 'admin' THEN
            NULL;
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION 'copier_modele_operation : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION 'copier_modele_operation : rôle % non autorisé.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    SELECT * INTO v_source
      FROM public.modeles_operations
     WHERE id = p_source_modele_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_operation : modèle source % introuvable.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_operation : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.categories
         WHERE id = v_source.categorie_id
    ) THEN
        v_source.categorie_id := public.copier_categorie_noeud(
            v_source.categorie_id, NULL, p_site_cible
        );
    ELSE
        SELECT id INTO v_source.categorie_id
          FROM public.categories
         WHERE site_id IS NULL AND parent_id IS NULL
           AND scope = 'operation'
           AND lower(nom) = 'non classé (opérations)'
         LIMIT 1;
        IF v_source.categorie_id IS NULL THEN
            RAISE EXCEPTION 'copier_modele_operation : catégorie de secours « Non classé (opérations) » introuvable — recréez-la avant de copier.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    INSERT INTO public.modeles_operations (
        id, site_id, nom, description, image_path, miniature_id, categorie_id
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        v_source.nom, v_source.description, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        v_source.categorie_id
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.modeles_operations_items (
        id, modele_operation_id, nom, description,
        type_operation_id, seuil_minimum, seuil_maximum, unite_id, ordre
    )
    SELECT gen_random_uuid(), v_new_id, nom, description,
           type_operation_id, seuil_minimum, seuil_maximum, unite_id, ordre
      FROM public.modeles_operations_items
     WHERE modele_operation_id = p_source_modele_id;

    RETURN v_new_id;
END;
$$;

-- 4.9 — resolve_prestataire_effectif (double branche « supprimé/introuvable »
--        effondrée en simple « introuvable »)
CREATE OR REPLACE FUNCTION public.resolve_prestataire_effectif(
    p_gamme_id            UUID,
    p_prestataire_demande UUID,
    p_date_prevue         DATE
)
RETURNS UUID
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $$
DECLARE
    v_prest_existe BOOLEAN;
    v_interne_id   UUID;
    v_has_gammes   BOOLEAN;
    v_valide       BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.prestataires
         WHERE id = p_prestataire_demande
    ) INTO v_prest_existe;

    IF NOT v_prest_existe THEN
        RAISE EXCEPTION 'Prestataire introuvable (id %).', p_prestataire_demande
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT pr.id INTO v_interne_id
      FROM public.prestataires pr
      JOIN public.gammes g ON g.id = p_gamme_id
     WHERE pr.est_interne = true
       AND pr.site_id = g.site_id;

    IF v_interne_id IS NULL THEN
        RAISE EXCEPTION 'Aucune équipe interne pour le site de la gamme % (régie de site manquante).', p_gamme_id;
    END IF;

    IF p_prestataire_demande = v_interne_id THEN
        RETURN v_interne_id;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.contrats_gammes WHERE gamme_id = p_gamme_id
    ) INTO v_has_gammes;

    IF v_has_gammes THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.contrats_gammes cg
              JOIN public.contrats c ON c.id = cg.contrat_id
             WHERE cg.gamme_id = p_gamme_id
               AND c.prestataire_id = p_prestataire_demande
               AND c.date_debut <= p_date_prevue
               AND (
                    c.date_fin IS NULL
                    OR c.date_fin >= p_date_prevue
                    OR c.type_contrat_id = 2
               )
               AND c.date_resiliation IS NULL
               AND c.est_archive = false
        ) INTO v_valide;
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM public.contrats c
             WHERE c.prestataire_id = p_prestataire_demande
               AND c.date_debut <= p_date_prevue
               AND (
                    c.date_fin IS NULL
                    OR c.date_fin >= p_date_prevue
                    OR c.type_contrat_id = 2
               )
               AND c.date_resiliation IS NULL
               AND c.est_archive = false
        ) INTO v_valide;
    END IF;

    RETURN CASE
        WHEN v_valide THEN p_prestataire_demande
        ELSE v_interne_id
    END;
END;
$$;

-- 4.10 — copier_gamme
CREATE OR REPLACE FUNCTION public.copier_gamme(
    p_source_gamme_id UUID,
    p_site_cible      UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role     TEXT := public.current_role();
    v_source   public.gammes%ROWTYPE;
    v_new_id   UUID;
BEGIN
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_gamme : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION
                'copier_gamme : seuls admin et manager peuvent copier une gamme vers le niveau entreprise (bibliothèque).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        IF v_role = 'admin' THEN
            NULL;
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION
                    'copier_gamme : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION
                'copier_gamme : rôle % non autorisé à injecter une gamme sur un site.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    SELECT * INTO v_source
    FROM public.gammes
    WHERE id = p_source_gamme_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_gamme : gamme source % introuvable.', p_source_gamme_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_gamme : accès refusé à la gamme source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    DECLARE
        v_cat_site    UUID;
        v_racine_id   UUID;
        v_cat_secours UUID;
    BEGIN
        IF v_source.categorie_id IS NOT NULL THEN
            SELECT site_id INTO v_cat_site FROM public.categories WHERE id = v_source.categorie_id;
            IF v_cat_site IS NOT NULL AND v_cat_site IS DISTINCT FROM p_site_cible THEN
                SELECT id INTO v_racine_id
                  FROM public.categories
                 WHERE site_id IS NULL AND parent_id IS NULL
                   AND lower(nom) = 'non classé (gammes)'
                 LIMIT 1;
                SELECT id INTO v_cat_secours
                  FROM public.categories
                 WHERE site_id IS NULL AND parent_id = v_racine_id
                   AND lower(nom) = 'non classé'
                 LIMIT 1;
                IF v_cat_secours IS NULL THEN
                    RAISE EXCEPTION 'copier_gamme : catégorie de secours « Non classé » introuvable — recréez-la avant de copier.'
                        USING ERRCODE = 'no_data_found';
                END IF;
                v_source.categorie_id := v_cat_secours;
            END IF;
        END IF;
    END;

    INSERT INTO public.gammes (
        id, site_id, copie_depuis_id,
        nom, description, nature, categorie_id,
        periodicite_id, prestataire_id, image_path, miniature_id,
        est_active, created_by
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        CASE WHEN p_site_cible IS NOT NULL THEN p_source_gamme_id ELSE NULL END,
        v_source.nom, v_source.description, v_source.nature, v_source.categorie_id,
        v_source.periodicite_id, v_source.prestataire_id, v_source.image_path,
        CASE WHEN public.miniature_scope_ok(v_source.miniature_id, p_site_cible)
             THEN v_source.miniature_id ELSE NULL END,
        true, (SELECT auth.uid())
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.operations (
        id, gamme_id,
        nom, description, type_operation_id,
        seuil_minimum, seuil_maximum, unite_id, ordre
    )
    SELECT
        gen_random_uuid(), v_new_id,
        o.nom, o.description, o.type_operation_id,
        o.seuil_minimum, o.seuil_maximum, o.unite_id, o.ordre
    FROM public.operations o
    WHERE o.gamme_id = p_source_gamme_id;

    INSERT INTO public.gamme_modeles (gamme_id, modele_operation_id)
    SELECT v_new_id, gm.modele_operation_id
    FROM public.gamme_modeles gm
    WHERE gm.gamme_id = p_source_gamme_id;

    RETURN v_new_id;
END;
$$;

-- 4.11 — copier_categorie_noeud
CREATE OR REPLACE FUNCTION public.copier_categorie_noeud(
    p_source_cat_id   UUID,
    p_parent_cible_id UUID,
    p_site_cible      UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_src   public.categories%ROWTYPE;
    v_cible UUID;
BEGIN
    SELECT * INTO v_src
      FROM public.categories
     WHERE id = p_source_cat_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_categorie_noeud : catégorie source % introuvable.', p_source_cat_id
            USING ERRCODE = 'no_data_found';
    END IF;

    SELECT id INTO v_cible
      FROM public.categories
     WHERE site_id   IS NOT DISTINCT FROM p_site_cible
       AND parent_id IS NOT DISTINCT FROM p_parent_cible_id
       AND scope      = v_src.scope
       AND lower(nom) = lower(v_src.nom)
     LIMIT 1;

    IF FOUND THEN
        RETURN v_cible;
    END IF;

    INSERT INTO public.categories (
        id, site_id, parent_id, copie_depuis_id,
        nom, scope, description, image_path, ordre, miniature_id
    ) VALUES (
        gen_random_uuid(), p_site_cible, p_parent_cible_id,
        CASE WHEN p_site_cible IS NOT NULL THEN p_source_cat_id ELSE NULL END,
        v_src.nom, v_src.scope, v_src.description, v_src.image_path, v_src.ordre,
        CASE WHEN public.miniature_scope_ok(v_src.miniature_id, p_site_cible)
             THEN v_src.miniature_id ELSE NULL END
    )
    RETURNING id INTO v_cible;

    RETURN v_cible;
END;
$$;

-- 4.12 — copier_categorie
CREATE OR REPLACE FUNCTION public.copier_categorie(
    p_source_categorie_id UUID,
    p_site_cible          UUID,
    p_souscat_ids         UUID[] DEFAULT '{}',
    p_gamme_ids           UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role             TEXT := public.current_role();
    v_source           public.categories%ROWTYPE;
    v_root_cible_id    UUID;
    v_souscat_cible_id UUID;
    v_cat_cible        UUID;
    v_ret              UUID;
    v_g                public.gammes%ROWTYPE;
    v_new_gamme_id     UUID;
    v_sc_id            UUID;
BEGIN
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_categorie : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_site_cible IS NULL THEN
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION
                'copier_categorie : seuls admin et manager peuvent copier une catégorie vers le niveau entreprise (commun).'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        IF v_role = 'admin' THEN
            NULL;
        ELSIF v_role IN ('manager', 'technicien') THEN
            IF NOT public.has_site_access(p_site_cible) THEN
                RAISE EXCEPTION
                    'copier_categorie : accès refusé au site cible %.', p_site_cible
                    USING ERRCODE = 'insufficient_privilege';
            END IF;
        ELSE
            RAISE EXCEPTION
                'copier_categorie : rôle % non autorisé à exporter une catégorie sur un site.', v_role
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    END IF;

    SELECT * INTO v_source
      FROM public.categories
     WHERE id = p_source_categorie_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_categorie : catégorie source % introuvable.', p_source_categorie_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_categorie : accès refusé à la catégorie source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_source.parent_id IS NULL THEN
        v_root_cible_id := public.copier_categorie_noeud(v_source.id, NULL, p_site_cible);

        FOR v_sc_id IN
            SELECT c.id
              FROM public.categories c
             WHERE c.id = ANY (p_souscat_ids)
               AND c.parent_id = v_source.id
               AND (
                   c.site_id IS NULL
                   OR v_role = 'admin'
                   OR public.has_site_access(c.site_id)
               )
        LOOP
            PERFORM public.copier_categorie_noeud(v_sc_id, v_root_cible_id, p_site_cible);
        END LOOP;

        v_ret := v_root_cible_id;
    ELSE
        v_root_cible_id    := public.copier_categorie_noeud(v_source.parent_id, NULL, p_site_cible);
        v_souscat_cible_id := public.copier_categorie_noeud(v_source.id, v_root_cible_id, p_site_cible);

        v_ret := v_souscat_cible_id;
    END IF;

    FOR v_g IN
        SELECT *
          FROM public.gammes
         WHERE id = ANY (p_gamme_ids)
    LOOP
        IF v_source.parent_id IS NOT NULL
           AND v_g.categorie_id IS DISTINCT FROM v_source.id THEN
            CONTINUE;
        END IF;

        IF v_g.site_id IS NOT NULL
           AND v_role <> 'admin'
           AND NOT public.has_site_access(v_g.site_id) THEN
            RAISE EXCEPTION 'copier_categorie : accès refusé à une gamme source (%).', v_g.id
                USING ERRCODE = 'insufficient_privilege';
        END IF;

        IF v_source.parent_id IS NULL THEN
            v_cat_cible := public.copier_categorie_noeud(v_g.categorie_id, v_root_cible_id, p_site_cible);
        ELSE
            v_cat_cible := v_souscat_cible_id;
        END IF;

        IF EXISTS (
            SELECT 1
              FROM public.gammes g2
             WHERE g2.categorie_id = v_cat_cible
               AND lower(g2.nom) = lower(v_g.nom)
        ) THEN
            CONTINUE;
        END IF;

        INSERT INTO public.gammes (
            id, site_id, copie_depuis_id,
            nom, description, nature, categorie_id,
            periodicite_id, prestataire_id, image_path, miniature_id,
            est_active, created_by
        ) VALUES (
            gen_random_uuid(), p_site_cible,
            CASE WHEN p_site_cible IS NOT NULL THEN v_g.id ELSE NULL END,
            v_g.nom, v_g.description, v_g.nature, v_cat_cible,
            v_g.periodicite_id, v_g.prestataire_id, v_g.image_path,
            CASE WHEN public.miniature_scope_ok(v_g.miniature_id, p_site_cible)
                 THEN v_g.miniature_id ELSE NULL END,
            true, (SELECT auth.uid())
        )
        RETURNING id INTO v_new_gamme_id;

        INSERT INTO public.operations (
            id, gamme_id,
            nom, description, type_operation_id,
            seuil_minimum, seuil_maximum, unite_id, ordre
        )
        SELECT
            gen_random_uuid(), v_new_gamme_id,
            o.nom, o.description, o.type_operation_id,
            o.seuil_minimum, o.seuil_maximum, o.unite_id, o.ordre
        FROM public.operations o
        WHERE o.gamme_id = v_g.id;

        INSERT INTO public.gamme_modeles (gamme_id, modele_operation_id)
        SELECT v_new_gamme_id, gm.modele_operation_id
        FROM public.gamme_modeles gm
        WHERE gm.gamme_id = v_g.id;
    END LOOP;

    RETURN v_ret;
END;
$$;

-- 4.13 — validation_transitions_ot
CREATE OR REPLACE FUNCTION public.validation_transitions_ot()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.statut = NEW.statut THEN
        RETURN NEW;
    END IF;

    IF OLD.statut = 'planifie'  AND NEW.statut NOT IN ('en_cours', 'cloture', 'annule') THEN
        RAISE EXCEPTION 'Transition interdite depuis « planifie » vers « % »', NEW.statut;
    END IF;
    IF OLD.statut = 'en_cours'  AND NEW.statut NOT IN ('planifie', 'cloture', 'annule') THEN
        RAISE EXCEPTION 'Transition interdite depuis « en_cours » vers « % »', NEW.statut;
    END IF;
    IF OLD.statut = 'cloture'   AND NEW.statut != 'reouvert' THEN
        RAISE EXCEPTION 'Depuis « cloture », seule la réouverture est autorisée';
    END IF;
    IF OLD.statut = 'annule'    AND NEW.statut != 'planifie' THEN
        RAISE EXCEPTION 'Depuis « annule », seule la résurrection (→ planifie) est autorisée';
    END IF;
    IF OLD.statut = 'reouvert'  AND NEW.statut NOT IN ('planifie', 'en_cours', 'cloture', 'annule') THEN
        RAISE EXCEPTION 'Transition interdite depuis « reouvert » vers « % »', NEW.statut;
    END IF;

    IF OLD.statut = 'annule' AND NEW.statut = 'planifie'
       AND NOT EXISTS (SELECT 1 FROM public.gammes WHERE id = NEW.gamme_id AND est_active) THEN
        RAISE EXCEPTION 'Résurrection impossible : la gamme est inactive';
    END IF;

    IF NEW.statut = 'cloture'
       AND EXISTS (
           SELECT 1 FROM public.operations_execution
           WHERE ordre_travail_id = NEW.id AND statut IN ('en_attente', 'en_cours')
       ) THEN
        RAISE EXCEPTION 'Clôture impossible : opérations non terminées. Terminez ou annulez l''OT.';
    END IF;

    IF NEW.statut = 'cloture'
       AND NOT EXISTS (
           SELECT 1 FROM public.operations_execution WHERE ordre_travail_id = NEW.id
       ) THEN
        RAISE EXCEPTION 'Clôture impossible : l''OT ne comporte aucune opération.';
    END IF;

    RETURN NEW;
END;
$$;

-- 4.14 — validation_gamme_avec_operations
CREATE OR REPLACE FUNCTION public.validation_gamme_avec_operations()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_nature      public.gamme_nature;
    v_a_des_ops   BOOLEAN;
    v_est_active  BOOLEAN;
BEGIN
    IF NEW.gamme_id IS NULL THEN
        RAISE EXCEPTION 'gamme_id obligatoire à la création d''un OT'
            USING ERRCODE = 'not_null_violation';
    END IF;

    SELECT nature, est_active INTO v_nature, v_est_active
    FROM public.gammes WHERE id = NEW.gamme_id;

    IF v_nature IS NULL THEN
        RAISE EXCEPTION 'Gamme % introuvable', NEW.gamme_id;
    END IF;

    IF NOT v_est_active THEN
        RAISE EXCEPTION 'Gamme % inactive — impossible de créer un OT', NEW.gamme_id;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.operations WHERE gamme_id = NEW.gamme_id
        UNION ALL
        SELECT 1 FROM public.gamme_modeles gm
        JOIN public.modeles_operations_items moi ON moi.modele_operation_id = gm.modele_operation_id
        WHERE gm.gamme_id = NEW.gamme_id
    ) INTO v_a_des_ops;

    IF NOT v_a_des_ops THEN
        RAISE EXCEPTION 'Gamme % sans opération : un OT doit comporter au moins une opération (ajoutez une opération ou un modèle à la gamme).', NEW.gamme_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

-- 4.15 — check_derniere_op_preventive
CREATE OR REPLACE FUNCTION public.check_derniere_op_preventive()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_old    jsonb := to_jsonb(OLD);
    v_gamme  uuid  := (v_old->>'gamme_id')::uuid;
    v_op_id  uuid  := (v_old->>'id')::uuid;
    v_modele uuid  := (v_old->>'modele_operation_id')::uuid;
    v_nature public.gamme_nature;
    v_active BOOLEAN;
    v_site   uuid;
    v_reste  BOOLEAN;
BEGIN
    SELECT nature, est_active, site_id INTO v_nature, v_active, v_site
    FROM public.gammes WHERE id = v_gamme;

    IF v_nature IS DISTINCT FROM 'maintenance_preventive'
       OR v_active IS NOT TRUE
       OR v_site IS NULL THEN
        RETURN OLD;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.operations o
        WHERE o.gamme_id = v_gamme
          AND (v_op_id IS NULL OR o.id <> v_op_id)
        UNION ALL
        SELECT 1 FROM public.gamme_modeles gm
        JOIN public.modeles_operations_items moi ON moi.modele_operation_id = gm.modele_operation_id
        WHERE gm.gamme_id = v_gamme
          AND (v_modele IS NULL OR gm.modele_operation_id <> v_modele)
    ) INTO v_reste;

    IF NOT v_reste THEN
        RAISE EXCEPTION 'Impossible de retirer la dernière opération de la gamme préventive % : une gamme préventive active doit conserver au moins une opération. Ajoutez-en une autre, ou désactivez la gamme d''abord.', v_gamme
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN OLD;
END;
$$;

-- 4.16 — creation_ot_orchestrator
CREATE OR REPLACE FUNCTION public.creation_ot_orchestrator()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.ordres_travail
        WHERE gamme_id = NEW.gamme_id
          AND id != NEW.id
          AND statut NOT IN ('cloture', 'annule')
    ) THEN
        RAISE EXCEPTION 'Un OT actif (planifie/en_cours/reouvert) existe déjà pour la gamme %.', NEW.gamme_id;
    END IF;

    PERFORM set_config('app.system_ot_generation', 'on', true);

    PERFORM public.snapshot_ot_from_gamme(NEW.id);
    PERFORM public.resolve_prestataire_for_ot(NEW.id);
    PERFORM public.generate_operations_execution(NEW.id);

    PERFORM set_config('app.system_ot_generation', 'off', true);

    RETURN NEW;
END;
$$;

-- 4.17 — reouvrir_ot
CREATE OR REPLACE FUNCTION public.reouvrir_ot(
    p_ot_id UUID,
    p_motif TEXT
)
RETURNS public.ordres_travail
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_ot public.ordres_travail;
BEGIN
    IF p_motif IS NULL OR length(trim(p_motif)) = 0 THEN
        RAISE EXCEPTION 'Motif de réouverture obligatoire'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_ot
    FROM public.ordres_travail
    WHERE id = p_ot_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'OT introuvable ou hors de votre périmètre';
    END IF;

    IF v_ot.statut <> 'cloture' THEN
        RAISE EXCEPTION 'Seul un OT clôturé peut être rouvert (statut actuel : %)',
            v_ot.statut;
    END IF;

    IF v_ot.gamme_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.ordres_travail
        WHERE gamme_id = v_ot.gamme_id
          AND id <> v_ot.id
          AND statut NOT IN ('cloture', 'annule')
    ) THEN
        RAISE EXCEPTION 'Réouverture impossible : un OT actif existe déjà pour cette gamme. Traitez-le (ou supprimez-le) avant de rouvrir cet OT.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    UPDATE public.ordres_travail
    SET statut            = 'reouvert',
        motif_reouverture = trim(p_motif)
    WHERE id = p_ot_id
    RETURNING * INTO v_ot;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Réouverture non autorisée : vous avez un accès en lecture seule à cet OT.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN v_ot;
END;
$$;

-- 4.18 — generate_next_ot_for_gamme
CREATE OR REPLACE FUNCTION public.generate_next_ot_for_gamme(
    p_gamme_id   UUID,
    p_created_by UUID,
    p_site_id    UUID,
    p_date_cloture_precedent DATE
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_gamme         RECORD;
    v_site_final    UUID;
    v_date_prevue   DATE;
    v_new_ot_id     UUID;
BEGIN
    SELECT g.id, g.site_id, g.prestataire_id, g.est_active,
           p.jours_periodicite, p.tolerance_jours, p.libelle
    INTO v_gamme
    FROM public.gammes g
    JOIN public.periodicites p ON p.id = g.periodicite_id
    WHERE g.id = p_gamme_id;

    IF v_gamme IS NULL OR NOT v_gamme.est_active THEN
        RETURN NULL;
    END IF;

    IF v_gamme.site_id IS NULL THEN
        RETURN NULL;
    END IF;
    IF v_gamme.jours_periodicite IS NULL OR v_gamme.jours_periodicite <= 0 THEN
        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.ordres_travail
        WHERE gamme_id = p_gamme_id
          AND statut NOT IN ('cloture', 'annule')
    ) THEN
        RETURN NULL;
    END IF;

    v_date_prevue := date_trunc('week',
                         COALESCE(p_date_cloture_precedent, CURRENT_DATE)
                         + (v_gamme.jours_periodicite * INTERVAL '1 day')
                     )::date;

    IF p_site_id IS NOT NULL THEN
        SELECT id INTO v_site_final
        FROM public.sites
        WHERE id = p_site_id;
    END IF;

    IF v_site_final IS NULL THEN
        SELECT id INTO v_site_final
        FROM public.sites
        WHERE id = v_gamme.site_id;
    END IF;

    IF v_site_final IS NULL THEN
        RAISE LOG 'generate_next_ot_for_gamme: gamme % sans site, abandon',
            p_gamme_id;
        RETURN NULL;
    END IF;

    PERFORM set_config('app.cron_generate_ot', 'on', true);
    PERFORM set_config('app.system_ot_generation', 'on', true);

    BEGIN
        INSERT INTO public.ordres_travail (
            site_id, gamme_id, prestataire_id,
            origine, date_prevue,
            nom_gamme, nature_gamme, nom_prestataire, libelle_periodicite,
            jours_periodicite, tolerance_jours,
            created_by
        ) VALUES (
            v_site_final, p_gamme_id, v_gamme.prestataire_id,
            'programme'::public.ot_origine, v_date_prevue,
            'TEMP', 'maintenance_preventive'::public.gamme_nature, 'TEMP', 'TEMP',
            v_gamme.jours_periodicite, COALESCE(v_gamme.tolerance_jours, 0),
            p_created_by
        )
        RETURNING id INTO v_new_ot_id;

        RETURN v_new_ot_id;
    EXCEPTION WHEN OTHERS THEN
        RAISE LOG 'generate_next_ot_for_gamme: skip gamme % (errcode=%)',
            p_gamme_id, SQLSTATE;
        INSERT INTO public.security_alerts (indicator, severity, details)
        VALUES ('ot_generation_failed', 'warning',
                jsonb_build_object('gamme_id', p_gamme_id, 'sqlstate', SQLSTATE));
        RETURN NULL;
    END;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. DROP explicite des index « purge_not_null » (servaient au cron 90j, supprimé
--    en 035). Non recréés.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_sites_deleted_at;
DROP INDEX IF EXISTS idx_batiments_deleted_at;
DROP INDEX IF EXISTS idx_niveaux_deleted_at;
DROP INDEX IF EXISTS idx_locaux_deleted_at;
DROP INDEX IF EXISTS idx_categories_deleted;
DROP INDEX IF EXISTS idx_equipements_deleted_at;
DROP INDEX IF EXISTS idx_modeles_equipements_deleted_at;
DROP INDEX IF EXISTS idx_modeles_operations_deleted;
DROP INDEX IF EXISTS idx_modeles_di_deleted;
DROP INDEX IF EXISTS idx_documents_deleted;

-- -----------------------------------------------------------------------------
-- 6. DROP COLUMN deleted_at (sans CASCADE) sur les 16 tables concernées.
-- -----------------------------------------------------------------------------
-- NB : les 34 index partiels « recreate_full » (prédicat WHERE ... deleted_at ...)
-- sont automatiquement supprimés par chaque DROP COLUMN (dépendance interne à la
-- table) ; ils sont recréés en version sans deleted_at à l'étape 7.
ALTER TABLE sites                  DROP COLUMN deleted_at;
ALTER TABLE batiments              DROP COLUMN deleted_at;
ALTER TABLE niveaux                DROP COLUMN deleted_at;
ALTER TABLE locaux                 DROP COLUMN deleted_at;
ALTER TABLE categories             DROP COLUMN deleted_at;
ALTER TABLE equipements            DROP COLUMN deleted_at;
ALTER TABLE modeles_equipements    DROP COLUMN deleted_at;
ALTER TABLE prestataires           DROP COLUMN deleted_at;
ALTER TABLE gammes                 DROP COLUMN deleted_at;
ALTER TABLE modeles_operations     DROP COLUMN deleted_at;
ALTER TABLE demandes_intervention  DROP COLUMN deleted_at;
ALTER TABLE interventions_chantier DROP COLUMN deleted_at;
ALTER TABLE investissements        DROP COLUMN deleted_at;
ALTER TABLE modeles_di             DROP COLUMN deleted_at;
ALTER TABLE ordres_travail         DROP COLUMN deleted_at;
ALTER TABLE documents              DROP COLUMN deleted_at;

-- -----------------------------------------------------------------------------
-- 6 bis. Recréation de v_equipements_complet APRÈS le DROP COLUMN.
-- -----------------------------------------------------------------------------
-- e.* n'expose désormais plus deleted_at. On rétablit security_invoker + GRANT.
CREATE VIEW public.v_equipements_complet AS
SELECT
    e.*,
    c.nom              AS categorie_nom,
    c.scope            AS categorie_scope,
    v.chemin_court     AS localisation_courte,
    v.chemin_complet   AS localisation_complete,
    v.site_id,
    v.batiment_id,
    v.niveau_id,
    v.site_nom,
    v.batiment_nom,
    v.niveau_nom,
    v.local_nom
FROM public.equipements e
LEFT JOIN public.categories       c ON c.id = e.categorie_id
LEFT JOIN public.v_locaux_chemin  v ON v.local_id = e.local_id;
ALTER VIEW public.v_equipements_complet SET (security_invoker = true);
GRANT SELECT ON public.v_equipements_complet TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. Recréation des 34 index « recreate_full » en version sans prédicat deleted_at
--    (les autres conditions partielles métier sont conservées).
-- -----------------------------------------------------------------------------

-- 7.a — index UNIQUE (16)
CREATE UNIQUE INDEX uq_sites_nom_active
    ON sites (lower(nom));

CREATE UNIQUE INDEX uq_batiments_site_nom_active
    ON batiments (site_id, lower(nom));

CREATE UNIQUE INDEX uq_niveaux_batiment_nom_active
    ON niveaux (batiment_id, lower(nom));

CREATE UNIQUE INDEX uq_locaux_niveau_nom_active
    ON locaux (niveau_id, lower(nom));

CREATE UNIQUE INDEX uq_categories_nom
    ON categories (
        COALESCE(site_id::text,   'ALL_SITES'),
        COALESCE(parent_id::text, 'ROOT'),
        scope,
        lower(nom)
    );

CREATE UNIQUE INDEX uq_equipements_code_inv_active
    ON equipements (code_inventaire)
    WHERE code_inventaire IS NOT NULL;

CREATE UNIQUE INDEX uniq_modeles_equipements_entreprise
    ON modeles_equipements (lower(nom))
    WHERE site_id IS NULL;

CREATE UNIQUE INDEX uniq_modeles_equipements_site
    ON modeles_equipements (site_id, lower(nom))
    WHERE site_id IS NOT NULL;

CREATE UNIQUE INDEX uniq_prestataire_interne_site
    ON prestataires(site_id)
    WHERE est_interne = true;

CREATE UNIQUE INDEX uq_prestataires_libelle_active
    ON prestataires(libelle)
    WHERE est_interne = false;

CREATE UNIQUE INDEX uniq_gammes_entreprise
    ON gammes (lower(nom))
    WHERE site_id IS NULL;

CREATE UNIQUE INDEX uniq_gammes_site
    ON gammes (site_id, lower(nom))
    WHERE site_id IS NOT NULL;

CREATE UNIQUE INDEX uniq_modeles_operations_entreprise
    ON modeles_operations (nom)
    WHERE site_id IS NULL;

CREATE UNIQUE INDEX uniq_modeles_operations_site
    ON modeles_operations (site_id, nom)
    WHERE site_id IS NOT NULL;

CREATE UNIQUE INDEX uq_ot_gamme_date_actifs
    ON ordres_travail(gamme_id, date_prevue)
    WHERE statut NOT IN ('cloture', 'annule');

CREATE UNIQUE INDEX documents_unique_hash
    ON documents (site_id, hash_sha256) NULLS NOT DISTINCT;

-- 7.b — index NON uniques (18)
CREATE INDEX idx_batiments_site ON batiments(site_id);

CREATE INDEX idx_niveaux_batiment ON niveaux(batiment_id);

CREATE INDEX idx_locaux_niveau ON locaux(niveau_id);

CREATE INDEX idx_equipements_local ON equipements(local_id);

CREATE INDEX idx_equipements_categorie ON equipements(categorie_id);

CREATE INDEX idx_modeles_equipements_site
    ON modeles_equipements(site_id)
    WHERE site_id IS NOT NULL;

CREATE INDEX idx_modeles_equipements_categorie
    ON modeles_equipements(categorie_id)
    WHERE categorie_id IS NOT NULL;

CREATE INDEX idx_modeles_equipements_actif
    ON modeles_equipements(site_id)
    WHERE est_actif = true;

CREATE INDEX idx_prestataires_siret
    ON prestataires(siret)
    WHERE siret IS NOT NULL;

CREATE INDEX idx_gammes_active
    ON gammes(est_active)
    WHERE est_active = true;

CREATE INDEX idx_gammes_periodicite
    ON gammes(periodicite_id);

CREATE INDEX idx_gammes_prestataire
    ON gammes(prestataire_id);

CREATE INDEX idx_gammes_categorie
    ON gammes(categorie_id)
    WHERE categorie_id IS NOT NULL;

CREATE INDEX idx_gammes_site
    ON gammes(site_id)
    WHERE site_id IS NOT NULL;

-- NB : idx_di_active / idx_chantier_active / idx_capex_active NE sont PAS recréés.
-- Ils étaient partiels (WHERE deleted_at IS NULL) et, sans ce prédicat, dupliquent
-- exactement les index plains déjà présents idx_di_site / idx_chantier_site /
-- idx_capex_site (ON site_id) — qui survivent au DROP COLUMN. On évite le doublon.

CREATE INDEX idx_ot_actifs
    ON ordres_travail(site_id, date_prevue);

-- -----------------------------------------------------------------------------
-- 8. COMMIT
-- -----------------------------------------------------------------------------
COMMIT;