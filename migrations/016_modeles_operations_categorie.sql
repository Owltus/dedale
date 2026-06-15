-- ============================================================================
-- 016_modeles_operations_categorie.sql
-- ----------------------------------------------------------------------------
-- Ajoute modeles_operations.categorie_id (NOT NULL, ON DELETE RESTRICT) à parité
-- de modeles_equipements.categorie_id : chaque modèle d'opération est rangé dans
-- une catégorie de scope 'operation' (racine-only, 1 niveau — cf. 014/015).
--
-- Ordre obligatoire : colonne NULLABLE -> backfill -> SET NOT NULL (sinon rejet).
-- Backfill : repli « Non classé (opérations) » (commun pour les modèles communs ;
-- catégorie de site matérialisée via copier_categorie_noeud pour les modèles de
-- site, afin que le trigger de cohérence de site accepte l'UPDATE et que le modèle
-- reste visible sous son périmètre).
--
-- Pré-requis : 014 + 015 appliquées (valeur 'operation' + repli commun + garde-fous).
-- Parité équipement : la protection d'une catégorie non vide repose sur la FK
-- RESTRICT (suppression dure) + le pré-contrôle front (mise en corbeille). On NE
-- modifie PAS check_categorie_suppression (il ignore aussi modeles_equipements).
-- Pas de reclassement legacy : modeles_operations n'a jamais porté de categorie_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne (nullable d'abord)
-- ----------------------------------------------------------------------------
ALTER TABLE public.modeles_operations
    ADD COLUMN IF NOT EXISTS categorie_id UUID
    REFERENCES public.categories(id) ON DELETE RESTRICT;

-- ----------------------------------------------------------------------------
-- 2. Backfill vers « Non classé (opérations) »
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_repli_commun UUID;
    r              RECORD;
    v_cat          UUID;
BEGIN
    SELECT id INTO v_repli_commun
      FROM public.categories
     WHERE site_id IS NULL AND parent_id IS NULL AND scope = 'operation'
       AND lower(nom) = 'non classé (opérations)' AND deleted_at IS NULL
     LIMIT 1;

    IF v_repli_commun IS NULL THEN
        RAISE EXCEPTION '016 : catégorie de repli « Non classé (opérations) » introuvable — appliquez 015 d''abord.';
    END IF;

    FOR r IN SELECT id, site_id FROM public.modeles_operations WHERE categorie_id IS NULL LOOP
        IF r.site_id IS NULL THEN
            v_cat := v_repli_commun;
        ELSE
            -- Find-or-create le repli sur le site du modèle (cohérence de site).
            v_cat := public.copier_categorie_noeud(v_repli_commun, NULL, r.site_id);
        END IF;
        UPDATE public.modeles_operations SET categorie_id = v_cat WHERE id = r.id;
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 3. NOT NULL
-- ----------------------------------------------------------------------------
ALTER TABLE public.modeles_operations ALTER COLUMN categorie_id SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Index (calque idx_modeles_equipements_categorie ; pas de deleted_at ici)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_modeles_operations_categorie
    ON public.modeles_operations(categorie_id);

-- ----------------------------------------------------------------------------
-- 5. Trigger de cohérence catégorie <-> modèle (calque
--    check_modele_equipement_categorie). Défaut STRICT : scope 'operation' requis
--    (refuse 'equipement'/'gamme'/'mixte') + cohérence de site.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_modele_operation_categorie()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    c_scope public.categorie_scope;
    c_site  UUID;
BEGIN
    IF NEW.categorie_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT scope, site_id INTO c_scope, c_site
      FROM public.categories
     WHERE id = NEW.categorie_id;

    -- Scope d'usage : seule une catégorie 'operation' classe un modèle d'opération.
    IF c_scope <> 'operation' THEN
        RAISE EXCEPTION 'Catégorie % de scope % : interdite sur un modèle d''opération (scope ''operation'' requis).',
            NEW.categorie_id, c_scope
            USING ERRCODE = 'check_violation';
    END IF;

    -- Cohérence site : catégorie de site -> modèle sur le même site (jamais commun).
    IF c_site IS NOT NULL THEN
        IF NEW.site_id IS NULL THEN
            RAISE EXCEPTION 'Modèle d''opération entreprise ne peut pas référencer une catégorie de site (catégorie % du site %).',
                NEW.categorie_id, c_site
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.site_id IS DISTINCT FROM c_site THEN
            RAISE EXCEPTION 'Catégorie % du site % mais modèle sur site %.',
                NEW.categorie_id, c_site, NEW.site_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_modeles_operations_check_categorie
    BEFORE INSERT OR UPDATE OF categorie_id, site_id ON public.modeles_operations
    FOR EACH ROW EXECUTE FUNCTION public.check_modele_operation_categorie();

COMMENT ON FUNCTION public.check_modele_operation_categorie() IS
    'Garantit qu''un modèle d''opération est classé dans une catégorie de scope ''operation'' et que la cohérence de site est respectée (catégorie de site -> modèle du même site). Calque de check_modele_equipement_categorie (scope strict ''operation''). (016)';
