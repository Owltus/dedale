-- =============================================================================
-- 048 — Travaux : « tâches » → ZONES concernées (local requis, sans libellé)
-- =============================================================================
-- La notion de tâche libre disparaît : une ligne de travaux_taches devient une
-- ZONE concernée = un local (obligatoire) + éventuellement un de ses équipements
-- + un statut d'avancement. On retire donc le libellé libre, on impose le local
-- et on passe sa FK en CASCADE (la zone n'a plus de sens si le local disparaît).
--
-- Destructif limité : les anciennes entrées sans local (tâches « libres ») ne
-- sont pas représentables dans le nouveau modèle → supprimées.
-- =============================================================================

BEGIN;

-- 1. Plus de libellé libre (le nom du local/équipement sert d'intitulé).
ALTER TABLE travaux_taches DROP COLUMN IF EXISTS libelle;

-- 2. Entrées sans local : non représentables désormais → retirées.
DELETE FROM travaux_taches WHERE local_id IS NULL;

-- 3. Local obligatoire + CASCADE (la zone suit la suppression de son local).
ALTER TABLE travaux_taches ALTER COLUMN local_id SET NOT NULL;
ALTER TABLE travaux_taches DROP CONSTRAINT IF EXISTS travaux_taches_local_id_fkey;
ALTER TABLE travaux_taches
    ADD CONSTRAINT travaux_taches_local_id_fkey
    FOREIGN KEY (local_id) REFERENCES locaux(id) ON DELETE CASCADE;

COMMENT ON TABLE travaux_taches IS
    'Zones concernées par un travail : un local (requis), un équipement précis optionnel, et un statut d''avancement.';

COMMIT;
