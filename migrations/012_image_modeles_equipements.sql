-- =============================================================================
-- 012 — Image (pool de vignettes) sur les MODÈLES D'ÉQUIPEMENT.
-- =============================================================================
-- Les modèles d'équipement n'avaient pas d'image branchée (colonne image_path
-- dormante, jamais affichée). On les rattache au POOL DE VIGNETTES (miniature_id),
-- exactement comme les catégories / gammes : dédup par hash, scope entreprise/site,
-- cohérence de site garantie par trigger. (Pendant pour les équipements-instances
-- = migration 013.)
--
-- modeles_equipements a un site_id DIRECT → on réutilise le trigger partagé
-- check_miniature_site_direct (comme categories/gammes/batiments) : une entité ne
-- peut porter qu'une vignette du pool ENTREPRISE (site_id NULL) ou de SON site.
--
-- Rétro-compatible : ADD COLUMN nullable (aucune ligne impactée) ; CREATE OR
-- REPLACE conserve les GRANT. À FAIRE APRÈS DÉPLOIEMENT : `npm run gen:types`
-- (la colonne miniature_id doit apparaître dans les types générés).
-- =============================================================================

BEGIN;

-- 1. Colonne + index (calque ALTER TABLE des catégories/gammes, v0.14b).
--    ON DELETE SET NULL : supprimer une vignette délie le modèle (ne le casse pas).
ALTER TABLE public.modeles_equipements
    ADD COLUMN miniature_id UUID REFERENCES public.miniatures(id) ON DELETE SET NULL;
CREATE INDEX idx_modeles_equipements_miniature
    ON public.modeles_equipements(miniature_id) WHERE miniature_id IS NOT NULL;

-- 2. Cohérence de site (Pattern 6) : site_id DIRECT → trigger partagé.
CREATE TRIGGER trg_check_miniature_site_modeles_equipements
    BEFORE INSERT OR UPDATE OF miniature_id ON public.modeles_equipements
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();

-- 3. Comptage de références : compter aussi les modèles d'équipement, sinon une
--    vignette utilisée par un modèle serait vue « refcount 0 » et son fichier
--    Storage supprimé à tort (cassant l'image du modèle).
CREATE OR REPLACE FUNCTION public.count_miniature_refs(p_miniature_id UUID)
RETURNS BIGINT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
    v_role TEXT := public.current_role();
BEGIN
    IF v_role IS NULL OR v_role NOT IN ('admin','manager','technicien') THEN
        RAISE EXCEPTION 'count_miniature_refs : rôle non autorisé'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN (SELECT count(*) FROM public.categories          WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.gammes              WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.prestataires        WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.batiments           WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.niveaux             WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.locaux              WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_equipements WHERE miniature_id = p_miniature_id);
END;
$$;

-- 4. copier_modele_equipement : la copie EMPORTE l'image si la vignette est
--    compatible avec le scope cible (miniature_scope_ok : pool entreprise ou même
--    site), sinon NULL — calque exact de copier_categorie_noeud. Seule la liste
--    INSERT (étape 5) change ; le reste est identique à la migration 009.
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
    -- 1. Auth caller
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_equipement : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Droits selon scope cible (calque copier_gamme)
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

    -- 3. Lecture du modèle source (vivant ; peut être archivé).
    SELECT * INTO v_source
      FROM public.modeles_equipements
     WHERE id = p_source_modele_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_equipement : modèle source % introuvable ou supprimé.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3bis. Contrôle d'accès à la SOURCE (audit défensif).
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_equipement : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. CATÉGORIE CIBLE — matérialisée dans le scope cible (find-or-create
    --    idempotent via copier_categorie_noeud, migration 009). Repli « Non classé
    --    (équipements) » si la catégorie source est en corbeille.
    IF EXISTS (
        SELECT 1 FROM public.categories
         WHERE id = v_source.categorie_id AND deleted_at IS NULL
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
           AND deleted_at IS NULL
         LIMIT 1;
        IF v_source.categorie_id IS NULL THEN
            RAISE EXCEPTION 'copier_modele_equipement : catégorie de secours « Non classé (équipements) » introuvable — recréez-la avant de copier.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    -- 5. Copie par valeur (Pattern 1). est_actif forcé à true. L'IMAGE (miniature)
    --    suit si elle reste compatible avec le scope cible, sinon NULL (migration 012).
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

COMMIT;
