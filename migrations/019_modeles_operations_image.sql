-- =============================================================================
-- 019 — Image (pool de vignettes) sur les MODÈLES D'OPÉRATION.
-- =============================================================================
-- Parité avec les modèles d'équipement (012) et de DI (018) : on rattache les
-- modèles d'opération au POOL DE VIGNETTES (miniature_id). modeles_operations a
-- un site_id DIRECT → trigger partagé check_miniature_site_direct.
--
-- (1) colonne + index ; (2) cohérence de site (trigger) ; (3) count_miniature_refs
-- compte aussi modeles_operations (sinon une vignette utilisée par un modèle
-- d'opération serait vue « refcount 0 » et son fichier Storage supprimé à tort) ;
-- (4) copier_modele_operation emporte l'image si elle reste compatible avec le
-- scope cible (miniature_scope_ok), sinon NULL — calque de copier_modele_equipement.
--
-- À FAIRE APRÈS DÉPLOIEMENT : `npm run gen:types`.
-- =============================================================================

BEGIN;

-- 1. Colonne + index. ON DELETE SET NULL : supprimer une vignette délie le modèle.
ALTER TABLE public.modeles_operations
    ADD COLUMN miniature_id UUID REFERENCES public.miniatures(id) ON DELETE SET NULL;
CREATE INDEX idx_modeles_operations_miniature
    ON public.modeles_operations(miniature_id) WHERE miniature_id IS NOT NULL;

-- 2. Cohérence de site (Pattern 6) : site_id DIRECT → trigger partagé.
CREATE TRIGGER trg_check_miniature_site_modeles_operations
    BEFORE INSERT OR UPDATE OF miniature_id ON public.modeles_operations
    FOR EACH ROW EXECUTE FUNCTION public.check_miniature_site_direct();

-- 3. Comptage de références : ajouter modeles_operations.
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
    RETURN (SELECT count(*) FROM public.categories   WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.gammes       WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.prestataires WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.batiments    WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.niveaux      WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.locaux       WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_equipements WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.equipements         WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_di          WHERE miniature_id = p_miniature_id)
         + (SELECT count(*) FROM public.modeles_operations  WHERE miniature_id = p_miniature_id);
END;
$$;

-- 4. copier_modele_operation : la copie EMPORTE l'image si compatible avec le
--    scope cible (miniature_scope_ok), sinon NULL. Seule la liste INSERT change
--    vs la migration 017.
CREATE OR REPLACE FUNCTION public.copier_modele_operation(
    p_source_modele_id UUID,
    p_site_cible       UUID
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
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

    SELECT * INTO v_source FROM public.modeles_operations WHERE id = p_source_modele_id;
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
         WHERE id = v_source.categorie_id AND deleted_at IS NULL
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
           AND deleted_at IS NULL
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

COMMIT;
