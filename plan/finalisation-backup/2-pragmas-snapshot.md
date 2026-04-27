# Étape 2 — PRAGMAs complets sur les connexions snapshot

## Objectif

Mettre les connexions ouvertes par `snapshot_database`, `read_snapshot_stats` et `validate_pending_db` en conformité avec la règle interne `.claude/rules/sqlite.md` : « Activer les PRAGMAs à chaque connexion ». Actuellement seul `busy_timeout` est appliqué dans `snapshot_database`, et aucun PRAGMA n'est appliqué aux deux autres.

## Contexte

`apply_pragmas` dans `db.rs:243` est privée et inclut `PRAGMA journal_mode = WAL`. Ce mode ne peut PAS être appliqué sur une connexion ouverte en `SQLITE_OPEN_READ_ONLY` (SQLite refuse de créer un fichier `-wal` en lecture seule). Il faut donc une variante `apply_pragmas_snapshot` qui omet `journal_mode` et est utilisable sur toute connexion read-only.

## Fichier(s) impacté(s)

- `src-tauri/src/db.rs`
- `src-tauri/src/commands/backup.rs`

## Travail à réaliser

### 1. Exposer une variante read-only de `apply_pragmas`

Dans `src-tauri/src/db.rs`, juste après `apply_pragmas` (ligne ~243), ajouter :

```rust
/// PRAGMAs adaptés aux connexions read-only (snapshot, validation) — omet
/// `journal_mode = WAL` qui échoue en lecture seule.
pub fn apply_pragmas_snapshot(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;
         PRAGMA cache_size = -64000;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 268435456;",
    )
    .map_err(|e| format!("Erreur lors de l'application des PRAGMAs snapshot : {}", e))
}
```

### 2. Appliquer dans `snapshot_database`

Dans `src-tauri/src/commands/backup.rs`, fonction `snapshot_database`, remplacer le `busy_timeout` actuel par l'appel à la nouvelle fonction :

```rust
let src = Connection::open_with_flags(
    src_path,
    OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
)
.map_err(|e| format!("Ouverture pour snapshot : {}", e))?;
db::apply_pragmas_snapshot(&src)?;

let mut dst = Connection::open(dst_path)
    .map_err(|e| format!("Création du fichier de snapshot : {}", e))?;
db::apply_pragmas_snapshot(&dst)?;
```

La constante `SQLITE_BUSY_TIMEOUT` devient inutile (intégrée dans le PRAGMA), à supprimer.

### 3. Appliquer dans `read_snapshot_stats`

Même fichier, fonction `read_snapshot_stats` (~ligne 222) : ajouter `db::apply_pragmas_snapshot(&conn)?;` après l'ouverture.

### 4. Appliquer dans `validate_pending_db`

Même fichier, fonction `validate_pending_db` (~ligne 339) : ajouter `db::apply_pragmas_snapshot(&conn)?;` après l'ouverture.

## Ordre d'exécution

1. Ajouter `apply_pragmas_snapshot` dans `db.rs`
2. Mettre à jour les 3 sites d'ouverture de connexion read-only dans `backup.rs`
3. Supprimer la constante `SQLITE_BUSY_TIMEOUT` devenue obsolète
4. `cargo check`

## Critère de validation

- `cargo check` passe sans warning nouveau
- Les 3 sites d'ouverture appellent `apply_pragmas_snapshot` immédiatement après `Connection::open*`
- La constante `SQLITE_BUSY_TIMEOUT` n'apparaît plus dans `backup.rs`
