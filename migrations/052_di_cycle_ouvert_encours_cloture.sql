-- =============================================================================
-- 052 — Demandes d'intervention : cycle Ouvert / En cours / Clôturé
-- =============================================================================
-- Remplace l'ancien modèle (Ouverte → Résolue ↔ Réouverte) par un cycle de vie à
-- 3 états plus lisible, avec TRANSITIONS LIBRES (décision PO « plus simple ») :
--   1 = Ouvert    (signalement non pris en charge — état initial)
--   2 = En cours  (pris en charge / en traitement)
--   3 = Clôturé   (traité et clos ; porte la note + resolved_by/date_resolution)
--
-- On GARDE id=1 = état « ouvrant » → la RLS du demandeur (statut_di_id = 1) reste
-- valable. Données existantes remappées : Résolue(2) → Clôturé(3) ;
-- Réouverte(3) → Ouvert(1) ; Ouverte(1) inchangé.
--
-- IDEMPOTENT : le remappage des données + le renommage du référentiel ne
-- s'exécutent QUE si l'ancien modèle est détecté (statuts_di id=2 = 'Résolue') ;
-- le reste est en CREATE OR REPLACE / DROP IF EXISTS. Pas de gen:types (aucune
-- colonne ne change).
-- =============================================================================

BEGIN;

-- 1) Migration des données + référentiel (gardée : ne s'exécute qu'une fois).
DO $migrate$
BEGIN
    IF EXISTS (SELECT 1 FROM statuts_di WHERE id = 2 AND nom = 'Résolue') THEN
        -- Triggers UPDATE neutralisés le temps du remappage (sinon l'ancienne
        -- machine refuserait des transitions et set/reset fausseraient resolved_by).
        DROP TRIGGER IF EXISTS trg_validation_transitions_di ON demandes_intervention;
        DROP TRIGGER IF EXISTS trg_validation_resolution_di  ON demandes_intervention;
        DROP TRIGGER IF EXISTS trg_di_set_resolved_by        ON demandes_intervention;
        DROP TRIGGER IF EXISTS trg_di_reset_reouverture      ON demandes_intervention;

        -- CASE : l'ANCIENNE valeur est lue pour toutes les lignes d'un coup → pas
        -- de collision (sinon 2→3 puis 3→1 retoucherait les lignes déjà migrées).
        UPDATE demandes_intervention SET statut_di_id = CASE statut_di_id
            WHEN 2 THEN 3
            WHEN 3 THEN 1
            ELSE statut_di_id
        END
        WHERE statut_di_id IN (2, 3);

        UPDATE statuts_di SET nom = 'Ouvert',
            description = 'Signalement non pris en charge (état initial)' WHERE id = 1;
        UPDATE statuts_di SET nom = 'En cours',
            description = 'Signalement pris en charge / en traitement' WHERE id = 2;
        UPDATE statuts_di SET nom = 'Clôturé',
            description = 'Signalement traité et clos' WHERE id = 3;
    END IF;
END
$migrate$;

-- 2) Statut initial : toujours Ouvert (id=1) à la création (message mis à jour).
CREATE OR REPLACE FUNCTION public.validation_statut_initial_di()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.statut_di_id IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'Le statut initial d''une DI doit être « Ouvert » (id=1)';
    END IF;
    RETURN NEW;
END;
$$;

-- 3) Transitions LIBRES : on retire la machine rigide. Le FK statuts_di garantit
--    déjà un statut valide ; la RLS arbitre QUI peut écrire.
DROP TRIGGER IF EXISTS trg_validation_transitions_di ON demandes_intervention;
DROP FUNCTION IF EXISTS public.validation_transitions_di();

-- 4) Clôture (→ Clôturé id=3) : note de clôture non vide obligatoire.
CREATE OR REPLACE FUNCTION public.validation_resolution_di()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF NEW.statut_di_id = 3 AND OLD.statut_di_id IS DISTINCT FROM 3 THEN
        IF NEW.description_resolution IS NULL OR length(trim(NEW.description_resolution)) = 0 THEN
            RAISE EXCEPTION 'Clôture impossible : une note de clôture non vide est obligatoire.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validation_resolution_di ON demandes_intervention;
CREATE TRIGGER trg_validation_resolution_di
    BEFORE UPDATE OF statut_di_id ON demandes_intervention
    FOR EACH ROW EXECUTE FUNCTION public.validation_resolution_di();

-- 5) Clôture : QUI + QUAND forcés serveur (resolved_by, date_resolution).
CREATE OR REPLACE FUNCTION public.set_di_resolved_by()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.resolved_by     := (SELECT auth.uid());
    NEW.date_resolution := current_date;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_di_set_resolved_by ON demandes_intervention;
CREATE TRIGGER trg_di_set_resolved_by
    BEFORE UPDATE OF statut_di_id ON demandes_intervention
    FOR EACH ROW
    WHEN (NEW.statut_di_id = 3 AND OLD.statut_di_id IS DISTINCT FROM 3)
    EXECUTE FUNCTION public.set_di_resolved_by();

-- 6) Réouverture (on QUITTE Clôturé) : on efface resolved_by/date_resolution
--    (la note de clôture, elle, est CONSERVÉE à titre d'historique).
CREATE OR REPLACE FUNCTION public.reset_di_reouverture()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.resolved_by     := NULL;
    NEW.date_resolution := NULL;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_di_reset_reouverture ON demandes_intervention;
CREATE TRIGGER trg_di_reset_reouverture
    BEFORE UPDATE OF statut_di_id ON demandes_intervention
    FOR EACH ROW
    WHEN (OLD.statut_di_id = 3 AND NEW.statut_di_id IS DISTINCT FROM 3)
    EXECUTE FUNCTION public.reset_di_reouverture();

-- 7) RLS demandeur : il n'agit que sur SA DI « Ouvert » (id=1) ET n'en change pas
--    le statut (le workflow En cours/Clôturé est réservé au métier). WITH CHECK
--    resserré de IN (1,2) à = 1 (plus d'auto-clôture par le demandeur).
DROP POLICY IF EXISTS di_demandeur_update ON demandes_intervention;
CREATE POLICY di_demandeur_update ON demandes_intervention FOR UPDATE
    USING (
        (SELECT public.current_role()) = 'demandeur'
        AND created_by = (SELECT auth.uid())
        AND statut_di_id = 1
    )
    WITH CHECK (
        (SELECT public.current_role()) = 'demandeur'
        AND created_by = (SELECT auth.uid())
        AND statut_di_id = 1
        AND public.has_site_access(site_id)
    );

COMMIT;
