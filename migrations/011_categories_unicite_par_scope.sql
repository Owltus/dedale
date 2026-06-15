-- =============================================================================
-- 011 — Unicité des catégories PAR SCOPE : « Sécurité incendie » côté ÉQUIPEMENT
--       et côté GAMME (Plan de maintenance) peuvent enfin coexister.
-- =============================================================================
-- Problème : uq_categories_nom indexait (site, parent, lower(nom)) SANS le scope.
-- Deux catégories de même nom mais de TYPE différent (equipement vs gamme)
-- entraient en collision 23505 — alors que la colonne `scope` existe justement
-- pour les distinguer. Impossible de créer une catégorie d'équipement « Sécurité
-- incendie » tant qu'une catégorie de gamme « Sécurité incendie » existe.
--
-- Correctif : on AJOUTE `scope` à la clé d'unicité (toujours partielle sur
-- deleted_at IS NULL, toujours insensible à la casse). Changement RELÂCHANT
-- (une colonne de plus → moins restrictif) : toute donnée valide sous l'ancien
-- index l'est aussi sous le nouveau → reconstruction SANS risque de 23505 sur
-- l'existant.
--
-- On aligne dans la foulée copier_categorie_noeud (FIND-OR-CREATE) pour qu'il
-- matche aussi sur le scope. Sans ça, une fois que deux homonymes de scopes
-- différents coexistent, son FIND (SELECT ... LIMIT 1, scope-aveugle)
-- réutiliserait à tort une catégorie du MAUVAIS scope : ex. une copie
-- d'équipement vers un site où existe une gamme homonyme retomberait dans la
-- catégorie de gamme et déclencherait check_modele_equipement_categorie au moment
-- d'y ranger un modèle. Avec le match sur scope, la copie réutilise/crée la bonne
-- catégorie de SON scope — ce qui corrige aussi l'angle mort « collision
-- inter-scope » relevé lors de l'audit du chantier copie « commun → site ».
--
-- Rétro-compatible : CREATE OR REPLACE conserve les GRANT ; signature inchangée.
-- Aucun gen:types (rien ne change côté types générés). Aucun changement front.
-- =============================================================================

BEGIN;

-- 1. Clé d'unicité : + scope. Deux catégories homonymes de TYPES différents
--    (equipement / gamme / mixte) au même (site, parent) sont désormais permises.
DROP INDEX IF EXISTS public.uq_categories_nom;
CREATE UNIQUE INDEX uq_categories_nom
    ON public.categories (
        COALESCE(site_id::text,   'ALL_SITES'),
        COALESCE(parent_id::text, 'ROOT'),
        scope,
        lower(nom)
    )
    WHERE deleted_at IS NULL;

-- 2. find-or-create aligné sur la nouvelle clé (scope inclus dans le FIND).
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
    -- Lecture de la catégorie source (vivante).
    SELECT * INTO v_src
      FROM public.categories
     WHERE id = p_source_cat_id
       AND deleted_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'copier_categorie_noeud : catégorie source % introuvable ou supprimée.', p_source_cat_id
            USING ERRCODE = 'no_data_found';
    END IF;

    -- FIND : un conteneur de même (site, parent, SCOPE, lower(nom)) existe déjà
    -- sur la cible → on le réutilise (merge). IS NOT DISTINCT FROM gère les NULL
    -- (commun / racine). Clé alignée sur uq_categories_nom (scope inclus depuis la
    -- migration 011) → on ne réutilise QUE dans le même scope.
    SELECT id INTO v_cible
      FROM public.categories
     WHERE site_id   IS NOT DISTINCT FROM p_site_cible
       AND parent_id IS NOT DISTINCT FROM p_parent_cible_id
       AND scope      = v_src.scope
       AND lower(nom) = lower(v_src.nom)
       AND deleted_at IS NULL
     LIMIT 1;

    IF FOUND THEN
        RETURN v_cible;
    END IF;

    -- CREATE : copie par valeur. scope/ordre conservés. miniature conservée si
    -- compatible avec le scope cible, sinon NULL. copie_depuis_id posé seulement
    -- pour un EXPORT vers un site (p_site_cible non NULL). Pas de created_by.
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

COMMENT ON FUNCTION public.copier_categorie_noeud(UUID, UUID, UUID) IS
    'Interne (copier_categorie) : FIND-OR-CREATE d''un nœud de catégorie sur la cible. Réutilise une catégorie vivante de même (site, parent, scope, lower(nom)) — clé de uq_categories_nom (scope inclus depuis migration 011) → merge dans le MÊME scope uniquement ; sinon crée une copie par valeur (nom, scope, description, image_path, ordre ; miniature conservée si miniature_scope_ok, sinon NULL ; copie_depuis_id posé seulement pour un export vers un site). public.categories n''a pas de created_by. SECURITY DEFINER (écrit hors RLS). NON exposé au client (service_role uniquement).';

COMMIT;
