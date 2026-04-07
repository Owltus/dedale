# Phase 1 — Extraire helper OT liste partagé

## Contexte

Le SELECT pour `OtListItem` (~150 lignes SQL + 17 lignes de mapping Rust) est copié-collé **6 fois** dans 4 fichiers :

| Fichier | Fonction(s) | Lignes |
|---------|-------------|--------|
| `ordres_travail.rs` | `get_ordres_travail()`, `get_ot_by_famille()`, `get_ot_by_gamme()` | 174-352 |
| `equipements.rs` | `get_ot_by_equipement()` | 649-678 |
| `techniciens.rs` | `get_ot_by_technicien()` | 153-181 |
| `localisations.rs` | `get_ot_by_local()` | 486-515 |

Chaque copie inclut : progression, retard, tri par priorité, mapping struct — identique à la lettre.

## Architecture cible

Créer un module helper partagé :

```
src-tauri/src/commands/
├── helpers/
│   ├── mod.rs
│   └── ot_list.rs      ← SQL + mapper OtListItem
├── ordres_travail.rs    ← utilise helpers::ot_list
├── equipements.rs       ← utilise helpers::ot_list
├── techniciens.rs       ← utilise helpers::ot_list
└── localisations.rs     ← utilise helpers::ot_list
```

## Ordre d'exécution

1. Créer `src-tauri/src/commands/helpers/mod.rs` avec `pub mod ot_list;`
2. Créer `src-tauri/src/commands/helpers/ot_list.rs` :
   - Constante `OT_LIST_BASE_SQL` : le SELECT complet (progression, retard, tri)
   - Constante `OT_LIST_COLS` : liste des colonnes sélectionnées
   - Fonction `map_ot_list_row(row: &rusqlite::Row) -> rusqlite::Result<OtListItem>`
   - Fonction `query_ot_list(conn: &Connection, where_clause: &str, params: &[&dyn rusqlite::types::ToSql]) -> Result<Vec<OtListItem>, String>`
3. Ajouter `pub mod helpers;` dans `src-tauri/src/commands/mod.rs`
4. Refactorer `ordres_travail.rs` :
   - `get_ordres_travail()` → `query_ot_list(conn, "", &[])`
   - `get_ot_by_famille()` → `query_ot_list(conn, "WHERE g.id_famille_gamme = ?1", &[&id_famille])`
   - `get_ot_by_gamme()` → `query_ot_list(conn, "WHERE ot.id_gamme = ?1", &[&id_gamme])`
5. Refactorer `equipements.rs` : `get_ot_by_equipement()` → appel helper
6. Refactorer `techniciens.rs` : `get_ot_by_technicien()` → appel helper
7. Refactorer `localisations.rs` : `get_ot_by_local()` → appel helper
8. `cargo check` — 0 erreur
9. `npx tsc --noEmit` — 0 erreur (pas de changement frontend)

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Rust commands | `helpers/mod.rs` | Nouveau |
| Rust commands | `helpers/ot_list.rs` | Nouveau |
| Rust commands | `commands/mod.rs` | Ajouter `pub mod helpers;` |
| Rust commands | `ordres_travail.rs` | Supprimer 3× SQL dupliqué |
| Rust commands | `equipements.rs` | Supprimer 1× SQL dupliqué |
| Rust commands | `techniciens.rs` | Supprimer 1× SQL dupliqué |
| Rust commands | `localisations.rs` | Supprimer 1× SQL dupliqué |
| **Total** | **7 fichiers** | 2 nouveaux, 5 modifiés |

## Vérification

1. **Compilation** : `cargo check` sans erreur
2. **Test fonctionnel** : page Ordres de travail — liste identique (progression, retard, tri)
3. **Test fonctionnel** : page Équipement détail — onglet OT identique
4. **Test fonctionnel** : page Technicien détail — onglet OT identique
5. **Test fonctionnel** : page Localisation détail — onglet OT identique
