-- =============================================================================
-- 045 — Nettoyage Travaux : retrait du prestataire + des liaisons à plat mortes
-- =============================================================================
-- Suite au repositionnement des Travaux (modal de création allégé + to-do
-- `travaux_taches`, migration 044) et au retrait de la notion de prestataire
-- côté travaux, on supprime ce qui n'est plus utilisé :
--   1. `interventions_travaux.prestataire_id` (colonne morte) → DROP COLUMN
--      (son index idx_travaux_prestataire et sa contrainte FK partent avec).
--   2. `travaux_localisations` / `travaux_equipements` (liaisons à plat),
--      remplacées par `travaux_taches` → DROP TABLE (retire aussi index, policies
--      RLS et triggers attachés), puis suppression des fonctions de trigger
--      devenues orphelines.
--
-- IRRÉVERSIBLE (DROP). À n'appliquer QU'APRÈS la migration 044.
-- Sûreté : `supprimer_site_cascade` purge `interventions_travaux` (les tables
-- supprimées en étaient des enfants cascadés par FK) → aucune fonction ne
-- référence directement les objets retirés.
-- =============================================================================

BEGIN;

-- 1. Travaux sans prestataire (colonne morte ; index + FK retirés avec elle).
ALTER TABLE interventions_travaux DROP COLUMN IF EXISTS prestataire_id;

-- 2. Anciennes liaisons à plat (remplacées par travaux_taches). DROP TABLE
--    retire aussi les index, policies RLS et triggers attachés.
DROP TABLE IF EXISTS travaux_localisations;
DROP TABLE IF EXISTS travaux_equipements;

-- 3. Fonctions de trigger devenues orphelines (leurs tables n'existent plus).
DROP FUNCTION IF EXISTS public.check_travaux_localisation_site();
DROP FUNCTION IF EXISTS public.check_travaux_equipement_site();

COMMIT;
