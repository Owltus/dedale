-- =============================================================================
-- 054 — Demandes d'intervention : clôture SANS note
-- =============================================================================
-- La clôture (passage en Clôturé, statut 3) n'exige plus de note de clôture.
-- On retire le trigger trg_validation_resolution_di + sa fonction (décision PO :
-- clôture DIRECTE, sans modale). resolved_by + date_resolution restent posés
-- côté serveur (trigger set_di_resolved_by, inchangé) ; la colonne
-- description_resolution demeure (legacy / historique), simplement non requise.
--
-- IDEMPOTENT (DROP IF EXISTS). Pas de gen:types (aucune colonne ne change).
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS trg_validation_resolution_di ON demandes_intervention;
DROP FUNCTION IF EXISTS public.validation_resolution_di();

COMMIT;
