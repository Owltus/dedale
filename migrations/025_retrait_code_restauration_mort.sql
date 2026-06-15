-- =============================================================================
-- 025 — Retrait du CODE DE RESTAURATION (code mort)
-- -----------------------------------------------------------------------------
-- Contexte : l'app n'a AUCUN chemin de restauration (pas d'écran, pas de RPC, pas
--   de mutation qui repasse deleted_at à NULL). Toute la machinerie de RESTAURATION
--   (branches « cas 2 » des cascades + fonctions de remontée d'ancêtres + la GUC
--   anti-récursion qui ne sert qu'à elles) ne se déclenche donc JAMAIS → code mort.
--
-- Ce qu'on RETIRE (mort) :
--   - restaure_chemin_categorie() + son trigger (remontée d'ancêtres catégorie).
--   - cascade_corbeille_ot() + son trigger (restauration d'un OT → remonte sa gamme).
--   - les branches « cas 2 : restauration » de cascade_corbeille_gamme et
--     cascade_corbeille_spatial (on ne garde que le « cas 1 : suppression »).
--   - la GUC app.cascade_soft_delete (uniquement utilisée par ce code) : son dernier
--     lecteur restant (le bypass de check_categorie_suppression) est retiré ici.
--
-- Ce qu'on GARDE (actif, NE PAS toucher) : la colonne deleted_at, la cascade de
--   SUPPRESSION (cas 1), les verrous de structure, et la purge 90 j. Le soft-delete
--   continue de fonctionner à l'identique — c'est ce qui fait « supprimer = disparaît ».
--
-- COMPORTEMENT : sur une SUPPRESSION, rien ne change (cas 1 reproduit à l'identique).
--   Sur une RESTAURATION (qui n'arrive jamais dans l'app), les triggers de cascade
--   deviennent des no-op au lieu de remonter les ancêtres — sans effet pratique.
--
-- ⚠️ NON TESTÉ EN BASE. Migration de NETTOYAGE (pas de changement de schéma de
--    données, pas de DROP COLUMN). Reproduit les fonctions à l'identique sauf le
--    retrait des branches mortes. Reporter dans schema_complete.sql APRÈS application.
--    Pas de `npm run gen:types` (signatures inchangées).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DROP des fonctions/triggers de restauration PURE (jamais déclenchés)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_categories_restaure_chemin ON public.categories;
DROP FUNCTION IF EXISTS public.restaure_chemin_categorie();

DROP TRIGGER IF EXISTS trg_ot_cascade_corbeille ON public.ordres_travail;
DROP FUNCTION IF EXISTS public.cascade_corbeille_ot();

-- ---------------------------------------------------------------------------
-- 2. cascade_corbeille_gamme : garder UNIQUEMENT le cas 1 (suppression)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_corbeille_gamme()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Suppression : descend les OT vivants de la gamme au même timestamp.
    -- (Branche « restauration » retirée — code mort, aucun chemin de restauration.)
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.ordres_travail
        SET deleted_at = NEW.deleted_at
        WHERE gamme_id = NEW.id
          AND deleted_at IS NULL;
    END IF;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.cascade_corbeille_gamme() IS
    'AFTER UPDATE OF deleted_at ON gammes : à la suppression, descend les OT vivants de la gamme (même timestamp). (025 : branche restauration retirée — code mort.)';

-- ---------------------------------------------------------------------------
-- 3. cascade_corbeille_spatial : garder UNIQUEMENT le cas 1 (descente)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cascade_corbeille_spatial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Suppression (descente du soft-delete vers les enfants). Branche « restauration »
    -- retirée (code mort, aucun chemin de restauration dans l'app).
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        IF TG_TABLE_NAME = 'sites' THEN
            UPDATE public.batiments            SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.gammes               SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.categories           SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.documents            SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.demandes_intervention SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
            UPDATE public.ordres_travail        SET deleted_at = NEW.deleted_at WHERE site_id = NEW.id AND deleted_at IS NULL;
        ELSIF TG_TABLE_NAME = 'batiments' THEN
            UPDATE public.niveaux     SET deleted_at = NEW.deleted_at WHERE batiment_id = NEW.id AND deleted_at IS NULL;
        ELSIF TG_TABLE_NAME = 'niveaux' THEN
            UPDATE public.locaux      SET deleted_at = NEW.deleted_at WHERE niveau_id = NEW.id AND deleted_at IS NULL;
        ELSIF TG_TABLE_NAME = 'locaux' THEN
            UPDATE public.equipements SET deleted_at = NEW.deleted_at WHERE local_id = NEW.id AND deleted_at IS NULL;
        END IF;
    END IF;

    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.cascade_corbeille_spatial() IS
    'v0.21 — AFTER UPDATE OF deleted_at sur sites/batiments/niveaux/locaux : cascade descendante du soft-delete à la suppression. Pour sites, descend aussi gammes/categories/documents/DI + OT de site. (025 : branche restauration retirée — code mort.)';

-- ---------------------------------------------------------------------------
-- 4. check_categorie_suppression : retirer le bypass GUC (devenu mort)
-- ---------------------------------------------------------------------------
-- Le verrou de structure est conservé À L'IDENTIQUE ; seul le bypass
-- `app.cascade_soft_delete` (posé uniquement par restaure_chemin_categorie, supprimée)
-- est retiré : il ne pouvait plus jamais valoir 'on'.
CREATE OR REPLACE FUNCTION public.check_categorie_suppression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Verrou de structure (023/024) : sous-catégorie, gamme, modèle d'équipement ou
    -- modèle d'opération encore VIVANT. (Pas equipements : categorie_id SET NULL.)
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
        SELECT 1 FROM public.modeles_operations mo
        WHERE mo.categorie_id = NEW.id
          AND mo.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION
            'Suppression impossible : cette catégorie contient encore des sous-catégories, des gammes ou des modèles. Videz d''abord son contenu.'
            USING ERRCODE = 'restrict_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.check_categorie_suppression() IS
    'BEFORE UPDATE OF deleted_at ON categories : verrou de structure. Bloque la suppression si la catégorie a une sous-catégorie, une gamme, un modèle d''équipement ou un modèle d''opération VIVANT (deleted_at IS NULL). (025 : bypass GUC app.cascade_soft_delete retiré — supprimé avec le code de restauration. cf. 023/024.)';

COMMIT;
