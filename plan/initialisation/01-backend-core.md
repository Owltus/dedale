# Phase 1 — Backend Rust (fondations)

## Objectif
Connexion SQLite fonctionnelle, schema initialisé, PRAGMAs configurés. Structure des commandes et modèles en place.

## Dépend de
Phase 0 (scaffolding)

## Étapes

### 1.1 Module de connexion SQLite (`src-tauri/src/db.rs`)

- Ouvrir/créer le fichier `gmao.db` dans le répertoire de données Tauri
- Appliquer les PRAGMAs à chaque connexion (voir `schema.sql` lignes 5-12) :
  ```sql
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 2000;
  PRAGMA cache_size = -64000;
  PRAGMA synchronous = NORMAL;
  PRAGMA temp_store = MEMORY;
  PRAGMA mmap_size = 268435456;
  ```
- **NE PAS activer** `recursive_triggers` (voir note schema.sql ligne 13)
- Exécuter `schema.sql` complet si la base est vide (détection via table `types_erp`)
- Exposer un `DbPool` (ou `Mutex<Connection>`) dans le state Tauri

### 1.2 State Tauri

```rust
// src-tauri/src/main.rs
fn main() {
    tauri::Builder::default()
        .manage(db::init_database())  // State partagé
        .invoke_handler(tauri::generate_handler![
            // commandes enregistrées ici
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au lancement");
}
```

### 1.3 Pattern des commandes Tauri

Chaque commande suit ce pattern :

```rust
// src-tauri/src/commands/exemple.rs
use tauri::State;
use crate::db::DbPool;
use crate::models::exemple::Exemple;

#[tauri::command]
pub fn get_exemples(db: State<DbPool>) -> Result<Vec<Exemple>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    // SQL brut via rusqlite
    let mut stmt = conn.prepare("SELECT ... FROM ...").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Exemple { ... })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
```

**Règles** :
- Toutes les commandes retournent `Result<T, String>`
- Les erreurs SQLite (y compris les triggers `RAISE(ABORT, ...)`) sont propagées telles quelles comme `String`
- 1 fichier Rust = 1 domaine métier

### 1.4 Pattern des modèles Rust

```rust
// src-tauri/src/models/exemple.rs
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Exemple {
    pub id: i64,
    pub nom: String,
    // ...
}
```

### 1.5 Commande de test : `ping`

```rust
#[tauri::command]
pub fn ping(db: State<DbPool>) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let version: String = conn.query_row(
        "SELECT sqlite_version()", [], |row| row.get(0)
    ).map_err(|e| e.to_string())?;
    Ok(format!("SQLite {}", version))
}
```

### 1.6 Fichier `lib.rs` — registre des modules

```rust
pub mod db;
pub mod commands;
pub mod models;
```

## Fichiers créés

| Fichier | Rôle |
|---|---|
| `src-tauri/src/db.rs` | Connexion, PRAGMAs, init schema |
| `src-tauri/src/lib.rs` | Registre des modules |
| `src-tauri/src/commands/mod.rs` | Re-export des commandes |
| `src-tauri/src/models/mod.rs` | Re-export des modèles |
| `src-tauri/src/commands/system.rs` | Commande `ping` |

## Critère de validation
- `invoke("ping")` depuis le frontend retourne `"SQLite 3.x.x"`
- Le fichier `gmao.db` est créé au bon emplacement
- Les tables de référence sont peuplées (types_erp, catégories, unités, etc.)
- `PRAGMA foreign_keys` retourne `1`

## Points d'attention
- Le `schema.sql` fait ~3000 lignes — l'exécuter en un bloc via `conn.execute_batch()`
- Tester que les triggers sont bien créés : `SELECT count(*) FROM sqlite_master WHERE type='trigger'` doit retourner ~40
- Le fichier DB doit être dans `tauri::api::path::app_data_dir()`, pas dans le répertoire du projet
