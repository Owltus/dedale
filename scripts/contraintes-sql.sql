-- Instantané des contraintes de colonnes du schéma `public`.
--
-- LECTURE SEULE. Aucune écriture, aucun DDL : ce fichier est destiné à être
-- rejoué à volonté sur la PRODUCTION par `scripts/instantane-contraintes.mjs`.
--
-- Il produit une UNIQUE ligne, une unique colonne `instantane`, contenant tout
-- ce dont `src/lib/concordance-sql.test.ts` a besoin pour juger qu'un schéma
-- Zod est plus permissif que sa colonne :
--
--   * le type, la nullabilité, la longueur maximale, la précision et l'échelle
--     de chaque colonne de chaque table de base ;
--   * la définition textuelle de chaque contrainte CHECK, par table.
--
-- La source est `information_schema` / `pg_constraint`, JAMAIS
-- `schema_complete.sql` : ce dernier a dérivé d'une trentaine de migrations, et
-- un garde-fou adossé à une source fausse est pire que pas de garde-fou.

SELECT jsonb_pretty(
  jsonb_build_object(
    'tables',
    (
      SELECT COALESCE(jsonb_object_agg(t.table_name, t.contenu), '{}'::jsonb)
      FROM (
        SELECT
          c.relname AS table_name,
          jsonb_build_object(
            'colonnes',
            (
              SELECT COALESCE(jsonb_object_agg(col.column_name, jsonb_build_object(
                'type', col.data_type,
                'nullable', col.is_nullable = 'YES',
                'longueurMax', col.character_maximum_length,
                'precision', col.numeric_precision,
                'echelle', col.numeric_scale,
                'aUnDefaut', col.column_default IS NOT NULL
              ) ORDER BY col.column_name), '{}'::jsonb)
              FROM information_schema.columns col
              WHERE col.table_schema = 'public'
                AND col.table_name = c.relname
            ),
            'checks',
            (
              SELECT COALESCE(jsonb_object_agg(k.conname, pg_get_constraintdef(k.oid)
                     ORDER BY k.conname), '{}'::jsonb)
              FROM pg_constraint k
              WHERE k.conrelid = c.oid
                AND k.contype = 'c'
            )
          ) AS contenu
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          -- Les tables `_sauvegarde_*` sont des filets de recette, poses par une
          -- migration et voues a disparaitre juste apres. Les faire entrer dans
          -- l'instantane versionne le ferait deriver deux fois pour rien : a la
          -- pose, puis a la suppression. Un contrat ne decrit pas le provisoire.
          AND c.relname NOT LIKE '\_sauvegarde\_%'
      ) t
    )
  )
) AS instantane;
