---
paths:
  - "src-tauri/**/*.rs"
  - "**/*.sql"
---

# Règles SQLite / rusqlite

## Connexion

- Activer les PRAGMAs à **chaque** connexion (pas une seule fois) :
  ```sql
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 2000;
  PRAGMA cache_size = -64000;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;
  PRAGMA mmap_size = 268435456;
  ```
- **NE JAMAIS activer `PRAGMA recursive_triggers`** — les triggers `date_modification` reposent sur son absence
- Wraper la connexion dans `std::sync::Mutex<Connection>` (pas `tokio::sync::Mutex`)

## Requêtes

- **SQL brut uniquement** — pas de query builder, pas d'ORM
- Utiliser `prepare_cached()` pour les requêtes fréquentes (listes, recherches)
- Utiliser `params![]` ou `named_params!{}` — **jamais `format!()`** pour injecter des valeurs
- Transactions explicites pour les écritures multiples : `let tx = conn.transaction()?;`

## Schéma existant

- **Ne pas modifier le schema.sql sans raison** — les triggers et CHECK sont interdépendants
- Les noms de colonnes sont en **français** — les conserver tels quels dans les requêtes
- Les dates métier utilisent `TEXT` au format `YYYY-MM-DD` (DATE)
- Les horodatages techniques utilisent `TEXT` au format `YYYY-MM-DD HH:MM:SS` (DATETIME)
- Les booléens sont des `INTEGER` (0/1) — SQLite STRICT ne supporte pas `BOOLEAN`

## Triggers — comportements à connaître

Le schema contient ~40 triggers. Les plus impactants :

| Trigger | Se déclenche quand | Effet |
|---|---|---|
| `creation_ot_complet` | INSERT ordres_travail | Remplit tous les snapshots + génère les opérations |
| `gestion_statut_ot` | UPDATE operations_execution (statut change) | Auto-passage En Cours, auto-clôture OT |
| `reprogrammation_auto` | UPDATE ordres_travail (date_cloture remplie) | Crée le prochain OT de la gamme |
| `nettoyage_dates_coherentes` | UPDATE ordres_travail (statut change) | Reset dates, cascade annulation ops |
| `reinitialisation_resurrection` | UPDATE ordres_travail (4→1) | Reset ops, régénère snapshots |
| `a_propagation_gamme_vers_ot` | UPDATE gammes | Propage nom/description/image aux OT actifs |
| `protection_ot_terminaux` | UPDATE ordres_travail (statut 3 ou 4) | Bloque modifications sauf réouverture/résurrection |
| `validation_contrat_creation` | INSERT ordres_travail (prestataire externe) | Bloque si gamme régl. sans contrat valide |

**Règle critique** : après un INSERT/UPDATE sur `ordres_travail` ou `operations_execution`, **toujours re-requêter** l'état complet pour capturer les effets des triggers.

## Données de référence

- Le prestataire `id=1` ("Mon Entreprise") est protégé — ne jamais le supprimer
- Les statuts OT (1-5), statuts opérations (1-5), priorités (1-4) ont des IDs hardcodés dans les triggers — ne pas les modifier
- Le statut opération 4 (Annulée) est **système uniquement** — ne jamais l'exposer comme choix utilisateur
