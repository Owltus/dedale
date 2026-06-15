-- ============================================================================
-- 017_copier_modele_operation.sql
-- ----------------------------------------------------------------------------
-- RPC copier_modele_operation : duplique PAR VALEUR un modèle d'opération (et ses
-- items) vers un site (p_site_cible renseigné) ou vers la bibliothèque entreprise
-- (p_site_cible NULL). Calque EXACT de copier_modele_equipement (migration 009/012)
-- adapté aux items (modeles_operations_items) au lieu du JSON specifications.
--
-- La catégorie de la source est MATÉRIALISÉE dans le scope cible via
-- copier_categorie_noeud (find-or-create idempotent). Repli « Non classé
-- (opérations) » (commun) si la catégorie source est en corbeille — comportement
-- identique à l'équipement.
--
-- Collision de nom (uniq_modeles_operations_site / _entreprise) : on laisse
-- remonter l'erreur 23505 au front (parité équipement, pas de suffixe auto).
--
-- Pré-requis : 016 appliquée (colonne categorie_id) + repli commun (015).
-- ============================================================================

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
    -- 1. Auth caller
    IF v_role IS NULL THEN
        RAISE EXCEPTION 'copier_modele_operation : utilisateur non authentifié ou désactivé.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Droits selon scope cible (calque copier_modele_equipement)
    IF p_site_cible IS NULL THEN
        -- Remontée vers la bibliothèque entreprise : admin + manager uniquement
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION 'copier_modele_operation : seuls admin et manager peuvent copier vers la bibliothèque entreprise.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        -- Descente / transfert vers un site
        IF v_role = 'admin' THEN
            NULL; -- admin : OK partout
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

    -- 3. Lecture du modèle source (modeles_operations n'a pas de soft-delete)
    SELECT * INTO v_source
      FROM public.modeles_operations
     WHERE id = p_source_modele_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_operation : modèle source % introuvable.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3bis. Contrôle d'accès à la SOURCE (audit défensif)
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_operation : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. CATÉGORIE CIBLE — matérialise via copier_categorie_noeud (find-or-create).
    --    Repli « Non classé (opérations) » (commun) si catégorie source en corbeille.
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

    -- 5. Copie du modèle PAR VALEUR (snapshot indépendant)
    INSERT INTO public.modeles_operations (
        id, site_id, nom, description, image_path, categorie_id
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        v_source.nom, v_source.description, v_source.image_path,
        v_source.categorie_id
    )
    RETURNING id INTO v_new_id;

    -- 6. Copie des items (modeles_operations_items) rattachés au NOUVEAU modèle
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

COMMENT ON FUNCTION public.copier_modele_operation(UUID, UUID) IS
    'Bibliothèque de modèles d''opérations : duplique un modèle PAR VALEUR (avec ses items) vers un site (p_site_cible renseigné) ou vers la bibliothèque entreprise (p_site_cible NULL). Copie indépendante de la source. La catégorie de la source est MATÉRIALISÉE dans le scope cible via copier_categorie_noeud (find-or-create idempotent). Repli « Non classé (opérations) » si la catégorie source est en corbeille. Droits : copie entreprise = admin/manager ; copie site = admin ou manager/technicien avec accès au site. Retourne l''id du nouveau modèle. Calque de copier_modele_equipement. (017)';
