-- =============================================================================
-- 023 — check_categorie_suppression : verrou étendu aux MODÈLES vivants
-- -----------------------------------------------------------------------------
-- But : interdire la mise en corbeille d'une catégorie qui classe encore un
--       `modeles_equipements` ou un `modeles_operations` VIVANT — en plus des
--       sous-catégories et gammes déjà couvertes.
--
-- Pourquoi : aujourd'hui le verrou ne teste que sous-catégories + gammes. Une
--   catégorie tenant des modèles vivants peut donc partir en corbeille → (a) elle
--   devient « immortelle » (la purge la bloque via NOT EXISTS modeles_*), (b) ses
--   modèles restent affichés sous une catégorie « supprimée », (c) pour les
--   équipements, la purge finit par NULLifier silencieusement equipements.categorie_id.
--
-- Décision tranchée : on NE bloque PAS sur `equipements` (categorie_id ON DELETE
--   SET NULL = déclassement volontaire, pas une perte de structure).
--
-- ⚠️ NON TESTÉ EN BASE. Tester sur staging (cf. plan/corbeille/3-tests-migrations.md).
-- Fonction courte → CREATE OR REPLACE complet. Le trigger existant
-- (trg_check_categorie_suppression) reste lié, inutile de le recréer.
-- Reporter dans schema_complete.sql. Pas de `npm run gen:types` (types inchangés).
--
-- NB — `modeles_operations` n'a PAS ENCORE de colonne `deleted_at` (ajoutée en 027) :
--   on ne peut donc pas filtrer son `deleted_at` ici. Tous les modèles d'opération
--   étant « vivants », l'EXISTS suffit. À la migration 027, RE-PATCHER cette
--   fonction pour ajouter `AND mo.deleted_at IS NULL` sur le bloc modeles_operations.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.check_categorie_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Bypass légitime (Pattern 3) — inactif en pratique.
    IF current_setting('app.cascade_soft_delete', true) = 'on' THEN
        RETURN NEW;
    END IF;

    -- Verrou de structure : refuse la mise en corbeille tant qu'un enfant VIVANT
    -- existe — sous-catégorie, gamme, modèle d'équipement ou modèle d'opération.
    -- (Pas equipements : categorie_id SET NULL = déclassement volontaire.)
    IF EXISTS (
        SELECT 1 FROM public.categories c
        WHERE c.parent_id = NEW.id
          AND c.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.gammes g
        WHERE g.categorie_id = NEW.id
          AND g.deleted_at IS NULL
    ) OR EXISTS (
        SELECT 1 FROM public.modeles_equipements me
        WHERE me.categorie_id = NEW.id
          AND me.deleted_at IS NULL
    ) OR EXISTS (
        -- modeles_operations : pas de deleted_at avant 027 → tous vivants.
        SELECT 1 FROM public.modeles_operations mo
        WHERE mo.categorie_id = NEW.id
    ) THEN
        RAISE EXCEPTION
            'Suppression impossible : cette catégorie contient encore des sous-catégories, des gammes ou des modèles. Videz d''abord son contenu.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_categorie_suppression() IS
    'BEFORE UPDATE OF deleted_at ON categories : verrou de structure. Bloque la mise en corbeille si la catégorie a une sous-catégorie, une gamme, un modèle d''équipement ou un modèle d''opération VIVANT. Force le bas-vers-haut. (023)';
