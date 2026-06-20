-- =============================================================================
-- 046 — Travaux : suppression de date_prevue (date de création seule)
-- =============================================================================
-- Le formulaire de travaux ne saisit plus de dates : la date de création
-- (date_demande, DEFAULT current_date) et la date de fin (posée par le trigger
-- de clôture) suffisent. `date_prevue` n'est plus alimentée → suppression.
-- Colonne isolée : aucun index ni trigger ne la référence (les autres
-- `date_prevue` du schéma sont sur ordres_travail / contrats, non concernées).
-- =============================================================================

BEGIN;

ALTER TABLE interventions_travaux DROP COLUMN IF EXISTS date_prevue;

COMMIT;
