use include_dir::{include_dir, Dir};
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use std::{fs, io};

/// Dossier migrations/ embarqué dans le binaire à la compilation.
/// Chaque fichier doit être nommé `NNN_description.sql` (numérotation séquentielle à partir de 001).
static MIGRATIONS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/migrations");

/// Nom de la table qui trace les migrations déjà appliquées sur la base.
const MIGRATIONS_TABLE: &str = "schema_migrations";

/// Table présente uniquement sur les bases créées AVANT l'introduction de `schema_migrations`.
/// Sa présence sert de signal pour bootstrapper l'historique (marquer la baseline 001 appliquée
/// sans la ré-exécuter, sinon les CREATE TABLE échoueraient sur les tables existantes).
const LEGACY_MARKER_TABLE: &str = "types_erp";

/// Pool de connexion SQLite — wrappé dans un Mutex standard (pas tokio)
pub type DbPool = Mutex<Connection>;

/// Initialise la connexion SQLite : PRAGMAs puis application des migrations manquantes.
pub fn init_database(app_data_dir: PathBuf) -> Result<DbPool, String> {
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Impossible de créer le répertoire de données : {}", e))?;

    let db_path = app_data_dir.join("dedale.db");
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Impossible d'ouvrir la base de données : {}", e))?;

    apply_pragmas(&conn)?;
    run_migrations(&conn, &db_path)?;

    Ok(Mutex::new(conn))
}

/// PRAGMAs de performance et sécurité — appliqués à chaque connexion.
fn apply_pragmas(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA journal_mode = WAL;
         PRAGMA busy_timeout = 2000;
         PRAGMA cache_size = -64000;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
         PRAGMA mmap_size = 268435456;",
    )
    .map_err(|e| format!("Erreur lors de l'application des PRAGMAs : {}", e))
    // NE PAS activer recursive_triggers — les triggers date_modification en dépendent
}

/// Représente un fichier de migration parsé depuis le dossier embarqué.
struct Migration {
    version: i64,
    name: String,
    sql: String,
}

/// Parse la version d'un nom de fichier `NNN_description.sql`.
fn parse_version(filename: &str) -> Result<i64, String> {
    let prefix: String = filename.chars().take_while(|c| c.is_ascii_digit()).collect();
    if prefix.is_empty() {
        return Err(format!("Nom de migration invalide : '{}' (attendu : NNN_description.sql)", filename));
    }
    prefix
        .parse::<i64>()
        .map_err(|_| format!("Numéro de migration invalide dans '{}'", filename))
}

/// Lit, parse et trie les fichiers du dossier migrations/ embarqué.
/// Échoue si la numérotation n'est pas séquentielle (1, 2, 3, … sans trou).
fn load_migrations() -> Result<Vec<Migration>, String> {
    let mut migrations: Vec<Migration> = Vec::new();

    for entry in MIGRATIONS.files() {
        let filename = entry
            .path()
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Nom de fichier de migration illisible".to_string())?;

        if !filename.ends_with(".sql") {
            continue;
        }

        let version = parse_version(filename)?;
        let sql = entry
            .contents_utf8()
            .ok_or_else(|| format!("Migration '{}' n'est pas en UTF-8", filename))?
            .to_string();
        migrations.push(Migration {
            version,
            name: filename.trim_end_matches(".sql").to_string(),
            sql,
        });
    }

    migrations.sort_by_key(|m| m.version);

    for (idx, m) in migrations.iter().enumerate() {
        let expected = (idx as i64) + 1;
        if m.version != expected {
            return Err(format!(
                "Numérotation de migration cassée : version {} trouvée, version {} attendue. \
                 Les migrations doivent être séquentielles à partir de 001.",
                m.version, expected
            ));
        }
    }

    if migrations.is_empty() {
        return Err("Aucun fichier de migration trouvé dans le binaire".to_string());
    }

    Ok(migrations)
}

/// Crée la table de suivi si elle n'existe pas déjà.
fn ensure_migrations_table(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS {} (
             version    INTEGER PRIMARY KEY,
             name       TEXT NOT NULL,
             applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
         ) STRICT;",
        MIGRATIONS_TABLE
    ))
    .map_err(|e| format!("Création de {} échouée : {}", MIGRATIONS_TABLE, e))
}

/// Détecte si une table existe dans la base.
fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
            [name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

/// Retourne la liste des versions déjà appliquées, triée.
fn applied_versions(conn: &Connection) -> Result<Vec<i64>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT version FROM {} ORDER BY version",
            MIGRATIONS_TABLE
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Bootstrap des bases pré-existantes créées avant l'introduction du système de migration.
/// Si la table `types_erp` existe mais que `schema_migrations` est vide, on considère que
/// la baseline (001) est déjà appliquée et on l'enregistre sans rejouer le SQL.
fn bootstrap_legacy_if_needed(
    conn: &Connection,
    baseline: &Migration,
) -> Result<bool, String> {
    let has_legacy = table_exists(conn, LEGACY_MARKER_TABLE)?;
    let already_tracked: i64 = conn
        .query_row(
            &format!("SELECT COUNT(*) FROM {}", MIGRATIONS_TABLE),
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if has_legacy && already_tracked == 0 {
        conn.execute(
            &format!(
                "INSERT INTO {} (version, name) VALUES (?1, ?2)",
                MIGRATIONS_TABLE
            ),
            rusqlite::params![baseline.version, baseline.name],
        )
        .map_err(|e| format!("Bootstrap legacy échoué : {}", e))?;
        return Ok(true);
    }
    Ok(false)
}

/// Applique une migration dans une transaction. Échec ⇒ ROLLBACK + erreur remontée.
fn apply_single_migration(conn: &Connection, m: &Migration) -> Result<(), String> {
    conn.execute_batch("BEGIN IMMEDIATE;")
        .map_err(|e| format!("BEGIN migration {} : {}", m.version, e))?;

    let result: Result<(), String> = (|| {
        conn.execute_batch(&m.sql)
            .map_err(|e| format!("SQL migration {} ({}) : {}", m.version, m.name, e))?;
        conn.execute(
            &format!(
                "INSERT INTO {} (version, name) VALUES (?1, ?2)",
                MIGRATIONS_TABLE
            ),
            rusqlite::params![m.version, m.name],
        )
        .map_err(|e| format!("Enregistrement migration {} : {}", m.version, e))?;
        Ok(())
    })();

    match result {
        Ok(()) => conn
            .execute_batch("COMMIT;")
            .map_err(|e| format!("COMMIT migration {} : {}", m.version, e)),
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(e)
        }
    }
}

/// Copie la base vers un fichier horodaté `dedale.db.backup-YYYYMMDD-HHMMSS`.
/// Retourne silencieusement en cas d'échec — un backup raté ne doit pas bloquer le boot.
fn backup_database(db_path: &std::path::Path) {
    let Some(parent) = db_path.parent() else { return };
    let Some(filename) = db_path.file_name().and_then(|n| n.to_str()) else { return };
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let target = parent.join(format!("{}.backup-{}", filename, stamp));
    if let Err(e) = fs::copy(db_path, &target) {
        if e.kind() != io::ErrorKind::NotFound {
            eprintln!("Backup pré-migration échoué : {}", e);
        }
    }
}

/// Orchestrateur : crée la table de suivi, bootstrap éventuel, puis applique les migrations
/// manquantes dans l'ordre. Un backup horodaté est créé si au moins une migration doit s'appliquer.
fn run_migrations(conn: &Connection, db_path: &std::path::Path) -> Result<(), String> {
    let migrations = load_migrations()?;
    ensure_migrations_table(conn)?;

    let baseline = &migrations[0];
    bootstrap_legacy_if_needed(conn, baseline)?;

    let applied: std::collections::HashSet<i64> = applied_versions(conn)?.into_iter().collect();
    let pending: Vec<&Migration> = migrations
        .iter()
        .filter(|m| !applied.contains(&m.version))
        .collect();

    if pending.is_empty() {
        return Ok(());
    }

    // Backup uniquement quand on va appliquer quelque chose sur une base existante
    if db_path.exists() {
        backup_database(db_path);
    }

    for m in pending {
        apply_single_migration(conn, m)?;
    }

    Ok(())
}
