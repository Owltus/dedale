-- ============================================================================
-- 015_categories_garde_fous_operation.sql
-- ----------------------------------------------------------------------------
-- Étend les garde-fous des catégories au scope 'operation' (ajouté en 014) pour
-- qu'une catégorie d'opération soit RACINE-ONLY (1 seul niveau), exactement comme
-- 'equipement'. Crée aussi la catégorie de repli « Non classé (opérations) »
-- (commune, racine) qui sert de cible au backfill (016) et de secours à la copie
-- (017).
--
-- Pré-requis : 014 appliquée et committée (valeur 'operation' disponible).
-- Calque : infra 'equipement' (chk_equipement_categorie_racine,
-- check_categorie_parent_scope). Index uq_categories_nom inclut déjà 'scope'
-- (migration 011) et la RLS de categories est scope-agnostique → rien à toucher.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CHECK racine-only étendu à 'operation'
--    (une catégorie d'équipement OU d'opération est toujours une racine).
-- ----------------------------------------------------------------------------
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS chk_equipement_categorie_racine;
ALTER TABLE public.categories
    ADD CONSTRAINT chk_equipement_categorie_racine
    CHECK (scope NOT IN ('equipement', 'operation') OR parent_id IS NULL);

-- ----------------------------------------------------------------------------
-- 2. check_categorie_parent_scope() : 'operation' traité comme 'equipement'
--    (1 seul niveau). Corps identique à l'existant, deux ajouts marqués (015).
-- ----------------------------------------------------------------------------
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
    -- 1 niveau equipement/operation — verrou AUSSI sur changement de scope : une
    -- catégorie d'équipement ou d'opération est TOUJOURS racine → elle ne peut pas
    -- déjà avoir des sous-catégories. (015 : 'operation' ajouté à côté de 'equipement'.)
    IF NEW.scope IN ('equipement', 'operation') AND EXISTS (
        SELECT 1 FROM public.categories e
         WHERE e.parent_id = NEW.id
           AND e.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégories (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Garde anti-promotion en racine : une sous-catégorie portant des gammes
    -- (vivantes ou en corbeille) ne peut pas devenir racine (parent_id → NULL).
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

    -- 1 niveau pour équipement/operation : une telle catégorie est toujours racine
    -- → elle ne peut pas servir de parent. (015 : 'operation' ajouté.)
    IF p_scope IN ('equipement', 'operation') THEN
        RAISE EXCEPTION 'Une catégorie d''équipement ou d''opération ne peut pas avoir de sous-catégorie (1 seul niveau).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2 niveaux pour les gammes : une catégorie pouvant accueillir des gammes
    -- (scope 'gamme' OU 'mixte') ne peut pas avoir un parent qui est lui-même un
    -- enfant (profondeur > 2).
    IF NEW.scope IN ('gamme', 'mixte') AND p_parent IS NOT NULL THEN
        RAISE EXCEPTION 'Une catégorie de gamme/mixte ne peut pas dépasser 2 niveaux (catégorie racine → sous-catégorie).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2 niveaux — verrou côté ANCÊTRE : une catégorie gamme/mixte qui DEVIENT une
    -- sous-catégorie (NEW.parent_id renseigné) ne peut pas avoir d'enfant vivant.
    IF NEW.scope IN ('gamme', 'mixte') AND NEW.parent_id IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM public.categories enfant
            WHERE enfant.parent_id = NEW.id
              AND enfant.deleted_at IS NULL
       ) THEN
        RAISE EXCEPTION 'Une sous-catégorie de gamme/mixte ne peut pas avoir d''enfants : re-parentage interdit (créerait un niveau 3).'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Parent site-scopé : l'enfant doit être sur le même site
    IF p_site IS NOT NULL AND NEW.site_id IS DISTINCT FROM p_site THEN
        RAISE EXCEPTION 'Catégorie enfant hors scope du parent site (parent_site=%, enfant_site=%)',
            p_site, NEW.site_id;
    END IF;

    -- Parent entreprise (p_site NULL) : tous les enfants sont permis
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_categorie_parent_scope() IS 'Cohérence parent : (1) un enfant n''est jamais plus large que son parent (entreprise englobe site) ; (2) une catégorie d''équipement OU d''opération ne peut pas avoir de sous-catégorie — ni comme parent, ni en basculant son scope alors qu''elle a déjà des enfants vivants (1 niveau) ; (3) une catégorie de gamme/mixte ne peut pas dépasser 2 niveaux ; (4) une sous-catégorie de gamme/mixte (niveau >=2) ne peut pas avoir d''enfants ; (5) une catégorie portant des gammes (vivantes ou en corbeille) ne peut pas être promue en racine. SECURITY DEFINER pour fiabiliser la lecture du parent. (015 : scope ''operation'' traité comme ''equipement''.)';

-- ----------------------------------------------------------------------------
-- 3. Catégorie de repli « Non classé (opérations) » : racine commune, scope
--    'operation'. Cible du backfill (016) et secours de copie (017).
--    Idempotent (NOT EXISTS sur la clé fonctionnelle).
-- ----------------------------------------------------------------------------
INSERT INTO public.categories (id, site_id, parent_id, nom, scope, ordre, est_actif)
SELECT gen_random_uuid(), NULL, NULL, 'Non classé (opérations)', 'operation', 0, true
WHERE NOT EXISTS (
    SELECT 1 FROM public.categories
     WHERE site_id IS NULL AND parent_id IS NULL AND scope = 'operation'
       AND lower(nom) = 'non classé (opérations)' AND deleted_at IS NULL
);
