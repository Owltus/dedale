-- Migration 004 : index partiel pour accélérer les requêtes de la page Relevés.
--
-- Les commandes `get_gammes_avec_releves` et `get_releves_by_gamme` filtrent toutes
-- deux `operations_execution` sur :
--     unite_symbole IS NOT NULL AND valeur_mesuree IS NOT NULL
-- pour ne conserver que les vraies mesures saisies. Sans index dédié, SQLite scanne
-- toute la table et applique le filtre après coup, ce qui est lent dès qu'on a
-- plusieurs centaines d'OT historiques mêlant opérations qualitatives et mesures.
--
-- Cet index PARTIEL :
--   1. n'indexe que les lignes "mesures saisies" (= une fraction de la table)
--   2. range les colonnes utilisées par les jointures et le tri (id_ordre_travail,
--      id_type_source, id_source) — couvre les deux requêtes
--
-- IF NOT EXISTS = idempotent : la migration peut être réappliquée sans erreur si
-- l'index a déjà été créé manuellement (cas de bases pré-installées).

CREATE INDEX IF NOT EXISTS idx_ops_exec_mesures_saisies
    ON operations_execution (id_ordre_travail, id_type_source, id_source)
    WHERE unite_symbole IS NOT NULL AND valeur_mesuree IS NOT NULL;
