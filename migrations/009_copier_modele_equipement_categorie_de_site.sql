-- =============================================================================
-- 009 — copier_modele_equipement : la copie atterrit dans une vraie CATÉGORIE du
--       scope cible (au lieu de rester dans la catégorie commune).
-- =============================================================================
-- Problème : copier un modèle « commun → site » créait bien un modèle DE SITE,
-- mais en gardant sa catégorie COMMUNE. Sous le filtre du site, une catégorie
-- commune n'apparaît pas → la copie restait invisible (seulement sous « Tout »).
--
-- Correctif : on MATÉRIALISE la catégorie de la source dans le scope cible via le
-- helper interne copier_categorie_noeud (find-or-create idempotent, déjà utilisé
-- par copier_categorie) :
--   - réutilise une catégorie vivante de même (site, parent, lower(nom)) sur la
--     cible (pas de doublon) ;
--   - sinon, la crée par valeur (nom, scope, description, image_path, ordre,
--     miniature si scope-ok).
-- L'index uq_categories_nom (clé sur site_id) autorise « Climatisation » commune
-- ET « Climatisation » de site à coexister. La catégorie de site obtenue est
-- compatible avec le modèle de site (check_modele_equipement_categorie : modèle
-- site → catégorie même site OK).
--
-- Rétro-compatible : CREATE OR REPLACE conserve les GRANT existants. Signature
-- inchangée (uuid, uuid) → uuid : aucun gen:types nécessaire côté front, et le
-- front n'a aucun changement à faire (il affiche déjà les catégories de site).
--
-- Idempotent / sûr : copier_modele_equipement et copier_categorie_noeud sont tous
-- deux SECURITY DEFINER (l'appel interne hérite des droits du DEFINER, comme
-- copier_categorie). Les copies DÉJÀ faites (legacy, en catégorie commune) ne sont
-- pas touchées par cette migration ; seules les NOUVELLES copies bénéficient du
-- comportement. Garde-fou : si la catégorie source est en corbeille, repli sur
-- « Non classé (équipements) » pour ne pas bloquer la copie.
-- =============================================================================

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
        -- Remontée vers bibliothèque entreprise : admin + manager uniquement
        IF v_role NOT IN ('admin', 'manager') THEN
            RAISE EXCEPTION 'copier_modele_equipement : seuls admin et manager peuvent copier vers la bibliothèque entreprise.'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
    ELSE
        -- Descente / transfert vers un site
        IF v_role = 'admin' THEN
            NULL; -- admin : OK partout
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

    -- 3. Lecture du modèle source (vivant ; peut être archivé est_actif = false :
    --    la copie sera réactivée à l'étape 5).
    SELECT * INTO v_source
      FROM public.modeles_equipements
     WHERE id = p_source_modele_id AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_modele_equipement : modèle source % introuvable ou supprimé.', p_source_modele_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- 3bis. Contrôle d'accès à la SOURCE (audit défensif) : lecture en SECURITY
    -- DEFINER (bypass RLS) → revérifier que le caller peut voir le modèle source.
    IF v_source.site_id IS NOT NULL
       AND v_role <> 'admin'
       AND NOT public.has_site_access(v_source.site_id) THEN
        RAISE EXCEPTION 'copier_modele_equipement : accès refusé au modèle source.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 4. CATÉGORIE CIBLE — on matérialise la catégorie de la source dans le scope
    --    cible (find-or-create idempotent) : une copie « commun → site » atterrit
    --    dans une VRAIE catégorie de site (même nom), visible sous le périmètre du
    --    site. Réutilise une catégorie homonyme existante (pas de doublon) ;
    --    idempotent si la source est déjà dans le scope cible. Catégorie
    --    d'équipement = toujours une racine → parent NULL.
    --    Garde-fou : catégorie source en corbeille → repli « Non classé (équipements) ».
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

    -- 5. Copie par valeur (Pattern 1 — snapshot indépendant).
    --    est_actif forcé à true : copie fraîche prête à l'emploi.
    INSERT INTO public.modeles_equipements (
        id, site_id, nom, description, image_path,
        categorie_id, specifications, est_actif, created_by
    ) VALUES (
        gen_random_uuid(), p_site_cible,
        v_source.nom, v_source.description, v_source.image_path,
        v_source.categorie_id, v_source.specifications,
        true, (SELECT auth.uid())
    )
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.copier_modele_equipement(UUID, UUID) IS
    'Bibliothèque de modèles d''équipements : duplique un modèle PAR VALEUR vers un site (p_site_cible renseigné) ou vers la bibliothèque entreprise (p_site_cible NULL). La catégorie de la source est MATÉRIALISÉE dans le scope cible via copier_categorie_noeud (find-or-create idempotent) → la copie atterrit dans une vraie catégorie du scope cible (visible sous son périmètre), en réutilisant une catégorie homonyme existante. Repli « Non classé (équipements) » si la catégorie source est en corbeille. Droits : copie entreprise = admin/manager ; copie site = admin ou manager/technicien avec accès au site. Retourne l''id du nouveau modèle.';
