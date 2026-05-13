use include_dir::{include_dir, Dir};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::{fs, io};

/// Dossier migrations/ embarqué dans le binaire à la compilation.
/// Chaque fichier doit être nommé `NNN_description.sql` (numérotation séquentielle à partir de 001).
static MIGRATIONS: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/migrations");

/// Nom de la table qui trace les migrations déjà appliquées sur la base.
const MIGRATIONS_TABLE: &str = "schema_migrations";

/// Pool de connexion SQLite — wrappé dans un Mutex standard (pas tokio)
pub type DbPool = Mutex<Connection>;

/// Retourne la version maximale de schéma embarquée dans le binaire (la plus récente
/// qu'on sait gérer). Utilisée pour rejeter une sauvegarde issue d'une version plus
/// récente de l'application — on ne charge jamais un schéma qu'on ne connaît pas.
pub fn embedded_schema_version() -> Result<i64, String> {
    let migrations = load_migrations()?;
    Ok(migrations.last().map(|m| m.version).unwrap_or(0))
}

const PRE_MIGRATION_DB_PREFIX: &str = "dedale.db.backup-pre-migration-";
const PRE_MIGRATION_KEEP: usize = 3;
/// Marqueur déposé après une restauration réussie — consommé par le frontend
pub const RESTORE_MARKER_NAME: &str = ".last-restore-marker";
/// Préfixe des snapshots temporaires SQLite (Online Backup) — partagé avec
/// `commands::backup` pour le nettoyage au boot.
pub const TMP_SNAPSHOT_PREFIX: &str = ".dedale-backup-tmp-";

const LEGACY_PRE_RESTORE_DB_PREFIX: &str = "dedale.db.backup-pre-restore-";
const LEGACY_PRE_RESTORE_DOCS_PREFIX: &str = "documents.pre-restore-";

/// Liste les entrées d'un répertoire qui matchent `prefix` (et `suffix` optionnel),
/// triées du plus récent au plus ancien (mtime), et supprime celles au-delà du
/// `keep` premier(s). Fichiers ou dossiers : la suppression est récursive si dir.
/// Échec silencieux : la rotation ne doit pas casser le boot.
pub(crate) fn prune_old_backups(dir: &Path, prefix: &str, suffix: Option<&str>, keep: usize) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut matches: Vec<(PathBuf, std::time::SystemTime)> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            if !name.starts_with(prefix) {
                return None;
            }
            if let Some(s) = suffix {
                if !name.ends_with(s) {
                    return None;
                }
            }
            let mtime = e.metadata().ok()?.modified().ok()?;
            Some((path, mtime))
        })
        .collect();
    matches.sort_by(|a, b| b.1.cmp(&a.1));
    for (path, _) in matches.into_iter().skip(keep) {
        if path.is_dir() {
            let _ = fs::remove_dir_all(&path);
        } else {
            let _ = fs::remove_file(&path);
        }
    }
}

/// Au boot, balaye une fois `app_data_dir` pour supprimer :
/// - les snapshots SQLite temporaires orphelins (préfixés par `TMP_SNAPSHOT_PREFIX`)
/// - les anciens backups pré-migration legacy au format `dedale.db.backup-YYYYMMDD-HHMMSS`
///   (sans sous-préfixe — le format actuel est `dedale.db.backup-pre-migration-…`)
/// - les anciens filets pré-restore (compat avec installations antérieures à
///   la refonte des sauvegardes locales)
/// - les archives temporaires de documents laissées par un swap interrompu
pub fn cleanup_stale_files_at_boot(app_data_dir: &Path) {
    let Ok(entries) = fs::read_dir(app_data_dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n,
            None => continue,
        };

        // Snapshot temporaire SQLite + compagnons WAL/SHM (créés par l'API
        // Online Backup quand la source est en mode WAL)
        if name.starts_with(TMP_SNAPSHOT_PREFIX)
            && (name.ends_with(".db") || name.ends_with(".db-wal") || name.ends_with(".db-shm"))
        {
            let _ = fs::remove_file(&path);
            continue;
        }

        if name.starts_with(LEGACY_PRE_RESTORE_DB_PREFIX) {
            let _ = fs::remove_file(&path);
            continue;
        }
        if name.starts_with(LEGACY_PRE_RESTORE_DOCS_PREFIX) {
            let _ = fs::remove_dir_all(&path);
            continue;
        }

        if name.starts_with("documents.replaced-") {
            let _ = fs::remove_dir_all(&path);
            continue;
        }

        // Backup pré-migration legacy (sans sous-préfixe explicite)
        if let Some(suffix) = name.strip_prefix("dedale.db.backup-") {
            if suffix.starts_with("manual-")
                || suffix.starts_with("pre-restore-")
                || suffix.starts_with("pre-migration-")
            {
                continue;
            }
            // Forme YYYYMMDD-HHMMSS (15 chars, '-' en [8], le reste numérique)
            let bytes = suffix.as_bytes();
            if bytes.len() != 15 || bytes[8] != b'-' {
                continue;
            }
            let all_digits = bytes
                .iter()
                .enumerate()
                .all(|(i, b)| if i == 8 { true } else { b.is_ascii_digit() });
            if all_digits {
                let _ = fs::remove_file(&path);
            }
        }
    }
}

/// Si un dossier `pending-restore/` est présent dans `app_data_dir`, applique le swap
/// AVANT toute ouverture de la base : la connexion SQLite n'est pas encore créée,
/// donc le fichier n'est pas verrouillé.
///
/// Stratégie atomique : on **renomme** la DB courante en `.replaced` au lieu de la
/// supprimer, on copie ensuite la nouvelle DB en place, et on supprime `.replaced`
/// uniquement si la copie a réussi. En cas d'échec en cours de route, on restaure
/// `.replaced` → DB courante pour garantir un boot dans tous les cas.
pub fn apply_pending_restore(app_data_dir: &Path) -> Result<(), String> {
    let pending = app_data_dir.join("pending-restore");
    if !pending.exists() {
        return Ok(());
    }

    let pending_db = pending.join("dedale.db");
    if !pending_db.exists() {
        let _ = fs::remove_dir_all(&pending);
        log::warn!("pending-restore présent sans dedale.db — ignoré");
        return Ok(());
    }

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let current_db = app_data_dir.join("dedale.db");
    let current_wal = app_data_dir.join("dedale.db-wal");
    let current_shm = app_data_dir.join("dedale.db-shm");

    // Étape 1 : mettre l'ancienne DB de côté via rename (rapide, atomique sur
    // même volume). Sert de filet de rollback en cas d'échec du swap. Sera
    // supprimée à la fin si tout s'est bien passé.
    let replaced_db = app_data_dir.join("dedale.db.replaced");
    let _ = fs::remove_file(&replaced_db); // résidu d'un crash précédent
    let had_current = current_db.exists();
    if had_current {
        fs::rename(&current_db, &replaced_db)
            .map_err(|e| format!("Mise de côté de l'ancienne DB : {}", e))?;
    }

    // Les journaux WAL/SHM appartenaient à l'ancienne DB — on les écarte
    // après la mise à l'écart (sinon en cas d'échec et rollback, on aurait
    // un dedale.db restauré sans son WAL).
    let _ = fs::remove_file(&current_wal);
    let _ = fs::remove_file(&current_shm);

    // Étape 2 : copier (pas rename — fonctionne cross-volume) la nouvelle DB en place
    if let Err(e) = fs::copy(&pending_db, &current_db) {
        // Rollback : remettre l'ancienne en place pour ne pas laisser le user sans DB
        if had_current {
            let _ = fs::rename(&replaced_db, &current_db);
        }
        return Err(format!("Restauration de dedale.db : {}", e));
    }

    // Étape 3 : succès — la nouvelle DB est en place. On peut supprimer
    // l'ancienne mise de côté.
    if had_current {
        let _ = fs::remove_file(&replaced_db);
    }

    // Documents : même logique de mise à l'écart puis swap. L'ancien dossier
    // est archivé temporairement le temps du swap, puis supprimé en cas de
    // succès. Si le swap échoue, on restaure l'archive pour ne rien perdre.
    let pending_docs = pending.join("documents");
    let current_docs = app_data_dir.join("documents");
    if pending_docs.exists() {
        let archive_target = app_data_dir.join(format!("documents.replaced-{}", stamp));
        let archived = if current_docs.exists() {
            match fs::rename(&current_docs, &archive_target) {
                Ok(_) => Some(archive_target.clone()),
                Err(e) => {
                    log::warn!("Mise de côté des documents échouée : {} — suppression brute", e);
                    let _ = fs::remove_dir_all(&current_docs);
                    None
                }
            }
        } else {
            None
        };

        if let Err(e) = fs::rename(&pending_docs, &current_docs) {
            // Rollback : restaurer l'ancien dossier mis de côté
            if let Some(arch) = archived.as_ref() {
                let _ = fs::rename(arch, &current_docs);
            }
            return Err(format!("Restauration du dossier documents : {}", e));
        }

        // Succès — supprimer l'archive temporaire
        if let Some(arch) = archived.as_ref() {
            let _ = fs::remove_dir_all(arch);
        }
    }

    // Marqueur consommé par le frontend pour afficher un toast post-restore
    let _ = fs::write(app_data_dir.join(RESTORE_MARKER_NAME), &stamp);

    fs::remove_dir_all(&pending)
        .map_err(|e| format!("Nettoyage pending-restore : {}", e))?;

    Ok(())
}

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

/// Applique une migration dans une transaction. Échec ⇒ ROLLBACK + erreur remontée.
///
/// `PRAGMA foreign_keys` est désactivé hors transaction pendant l'application
/// (pattern officiel SQLite « 12-step ALTER TABLE ») : permet aux migrations qui
/// recréent une table (DROP + RENAME) de ne pas déclencher les ON DELETE CASCADE
/// sur les tables filles, et évite que des violations FK préexistantes (héritées
/// d'anciennes migrations sans contrôle d'intégrité) ne bloquent un COMMIT
/// légitime via `defer_foreign_keys`.
fn apply_single_migration(conn: &Connection, m: &Migration) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = OFF;")
        .map_err(|e| format!("foreign_keys OFF avant migration {} : {}", m.version, e))?;

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

    let final_result = match result {
        Ok(()) => conn
            .execute_batch("COMMIT;")
            .map_err(|e| format!("COMMIT migration {} : {}", m.version, e)),
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(e)
        }
    };

    // Réactivation des FK critique : laisser la base avec FK désactivées casserait
    // silencieusement toute future opération qui dépend de l'intégrité référentielle.
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("foreign_keys ON après migration {} : {}", m.version, e))?;

    final_result
}

/// Copie la base vers un fichier horodaté `dedale.db.backup-pre-migration-YYYYMMDD-HHMMSS`.
/// Retourne silencieusement en cas d'échec — un backup raté ne doit pas bloquer le boot.
/// Une rotation est appliquée par l'appelant pour ne pas accumuler indéfiniment.
fn backup_database(db_path: &std::path::Path) {
    let Some(parent) = db_path.parent() else { return };
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let target = parent.join(format!("{}{}", PRE_MIGRATION_DB_PREFIX, stamp));
    if let Err(e) = fs::copy(db_path, &target) {
        if e.kind() != io::ErrorKind::NotFound {
            log::warn!("Backup pré-migration échoué : {}", e);
        }
    }
}

/// Orchestrateur : crée la table de suivi puis applique les migrations manquantes
/// dans l'ordre. Un backup horodaté est créé si au moins une migration doit s'appliquer.
fn run_migrations(conn: &Connection, db_path: &std::path::Path) -> Result<(), String> {
    let migrations = load_migrations()?;
    ensure_migrations_table(conn)?;

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
        // Rotation immédiate pour ne pas accumuler indéfiniment les pré-migration
        if let Some(parent) = db_path.parent() {
            prune_old_backups(parent, PRE_MIGRATION_DB_PREFIX, None, PRE_MIGRATION_KEEP);
        }
    }

    for m in pending {
        apply_single_migration(conn, m)?;
    }

    Ok(())
}
