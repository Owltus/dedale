-- =============================================================================
-- 049 — Demandes d'intervention : retrait de la notion de prestataire
-- =============================================================================
-- Un prestataire n'a pas de sens sur un SIGNALEMENT (DI) : l'affectation d'un
-- intervenant se décide au niveau de l'OT / de la gamme, jamais de la demande.
-- La colonne était inutilisée (aucun index dédié, aucun trigger ni fonction ne
-- la lit) → on la retire. DROP COLUMN supprime aussi la FK inline
-- demandes_intervention_prestataire_id_fkey.
-- =============================================================================

BEGIN;

ALTER TABLE demandes_intervention DROP COLUMN IF EXISTS prestataire_id;

COMMIT;
