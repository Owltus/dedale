use rusqlite::Connection;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Le schéma SQL complet, embarqué à la compilation
const SCHEMA_SQL: &str = include_str!("../schema.sql");

/// Version du schéma — incrémentée à chaque changement de schema.sql
const SCHEMA_VERSION: i64 = 1;

/// Pool de connexion SQLite — wrappé dans un Mutex standard (pas tokio)
pub type DbPool = Mutex<Connection>;

/// Initialise la connexion SQLite avec PRAGMAs et schéma
pub fn init_database(app_data_dir: PathBuf) -> Result<DbPool, String> {
    fs::create_dir_all(&app_data_dir).map_err(|e| {
        format!("Impossible de créer le répertoire de données : {}", e)
    })?;

    let db_path = app_data_dir.join("dedale.db");
    let conn = Connection::open(&db_path).map_err(|e| {
        format!("Impossible d'ouvrir la base de données : {}", e)
    })?;

    // PRAGMAs obligatoires à chaque connexion
    apply_pragmas(&conn)?;

    // Initialiser le schéma si la base est vide
    init_schema_if_empty(&conn)?;

    // Vérifier la version du schéma
    check_schema_version(&conn)?;

    Ok(Mutex::new(conn))
}

/// Applique les PRAGMAs de performance et sécurité
fn apply_pragmas(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 2000;
         PRAGMA cache_size = -64000;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 268435456;"
    )
    .map_err(|e| format!("Erreur lors de l'application des PRAGMAs : {}", e))
    // NE PAS activer recursive_triggers — les triggers date_modification en dépendent
}

/// Exécute le schéma complet si la base est vide (détection via types_erp)
fn init_schema_if_empty(conn: &Connection) -> Result<(), String> {
    let table_exists: bool = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='types_erp'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| format!("Erreur lors de la vérification du schéma : {}", e))?
        > 0;

    if !table_exists {
        conn.execute_batch("BEGIN TRANSACTION;")
            .map_err(|e| format!("Erreur début transaction schéma : {}", e))?;

        match conn.execute_batch(SCHEMA_SQL) {
            Ok(_) => {
                conn.execute_batch(&format!("PRAGMA user_version = {};", SCHEMA_VERSION))
                    .map_err(|e| format!("Erreur PRAGMA user_version : {}", e))?;
                conn.execute_batch("COMMIT;")
                    .map_err(|e| format!("Erreur commit schéma : {}", e))?;
            }
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK;");
                return Err(format!("Erreur lors de l'initialisation du schéma : {}", e));
            }
        }
    }

    Ok(())
}

/// Vérifie que la version du schéma correspond à celle attendue
fn check_schema_version(conn: &Connection) -> Result<(), String> {
    let version: i64 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap_or(0);

    if version == SCHEMA_VERSION {
        return Ok(());
    }

    if version == 0 {
        // Base fraîche sans version — marquer avec la version courante
        conn.execute_batch(&format!("PRAGMA user_version = {};", SCHEMA_VERSION))
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err(format!(
        "Version du schéma incompatible (trouvée : v{}, attendue : v{}). \
         Supprimez la base de données et relancez l'application, ou exécutez seed.py.",
        version, SCHEMA_VERSION
    ))
}
