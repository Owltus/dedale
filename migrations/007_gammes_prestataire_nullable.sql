-- 007_gammes_prestataire_nullable.sql
-- Date : 2026-06-11
-- But  : gammes.prestataire_id devient NULLABLE. Un template commun (site_id NULL)
--        n'a PAS de prestataire — celui-ci dépend du SITE (chaque site a ses
--        propres prestataires) et se renseigne APRÈS la copie de la gamme sur un
--        site. Les gammes RÉELLES continuent de porter un prestataire (imposé côté
--        front, schéma gamme réelle), et la génération d'OT reste protégée par
--        ordres_travail.prestataire_id NOT NULL → impossible de générer un OT sans
--        prestataire, même si la gamme source en a un NULL.
-- Touche schema_complete.sql : table gammes (colonne prestataire_id : retrait du
--        NOT NULL + COMMENT ON COLUMN mis à jour).
-- Risque data : NUL. DROP NOT NULL est NON DESTRUCTIF : il élargit le domaine de la
--        colonne ; aucune ligne existante n'est en violation (toutes ont déjà un
--        prestataire). La FK ON DELETE RESTRICT et l'index restent valides.
-- Après application : npm run gen:types
BEGIN;

-- Rendre le prestataire facultatif (les templates communs n'en ont pas).
ALTER TABLE public.gammes ALTER COLUMN prestataire_id DROP NOT NULL;

COMMENT ON COLUMN public.gammes.prestataire_id IS
    'Prestataire par défaut. NULLABLE (migration 007) : un template commun (site_id NULL) n''en a pas — le prestataire dépend du SITE, renseigné après copie sur un site. Les gammes réelles en portent un (imposé côté front) ; la génération d''OT reste protégée par ordres_travail.prestataire_id NOT NULL.';

COMMIT;
