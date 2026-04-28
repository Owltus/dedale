use rusqlite::backup::{Backup, StepResult};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::{self, DbPool};

// ════════════════════════════════════════════════════════════════════════════
// ── Constantes ──
// ════════════════════════════════════════════════════════════════════════════

/// Version du format de l'archive — bump si on change la structure du zip
const FORMAT_VERSION: i64 = 1;
/// Versions de format que cette version de l'application sait lire
const SUPPORTED_FORMAT_VERSIONS: &[i64] = &[1];
const MANIFEST_NAME: &str = "manifest.json";
const DB_NAME_IN_ZIP: &str = "dedale.db";
const DOCUMENTS_PREFIX: &str = "documents/";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

// ════════════════════════════════════════════════════════════════════════════
// ── Modèles ──
// ════════════════════════════════════════════════════════════════════════════

#[derive(Serialize, Deserialize)]
pub struct BackupManifest {
    pub format_version: i64,
    pub schema_version: i64,
    pub created_at: String,
    pub app_version: String,
    pub db_size_bytes: i64,
    /// SHA-256 du fichier `dedale.db` archivé. Vide pour les backups produits
    /// avant l'introduction de ce champ — le check de hash est alors sauté.
    #[serde(default)]
    pub db_sha256: String,
    pub documents_count: i64,
    /// Nom de l'établissement au moment de la sauvegarde — sert à identifier
    /// rapidement le contenu d'une archive sans l'ouvrir.
    #[serde(default)]
    pub etablissement_nom: Option<String>,
    /// Comptes lus sur le snapshot DB lui-même (donc cohérents avec ce qui
    /// est archivé, contrairement à un comptage à la volée sur la DB courante).
    #[serde(default)]
    pub ot_count: i64,
    #[serde(default)]
    pub gammes_count: i64,
    #[serde(default)]
    pub equipements_count: i64,
}

#[derive(Serialize)]
pub struct BackupInfo {
    pub path: String,
    pub size_bytes: i64,
    pub manifest: BackupManifest,
}

/// Sauvegarde locale automatique (créée par `apply_pending_restore` avant un swap).
/// Une entrée par horodatage trouvé dans `app_data_dir`.
#[derive(Serialize)]
pub struct LocalPreRestoreBackup {
    /// Horodatage YYYYMMDD-HHMMSS extrait du nom du fichier
    pub stamp: String,
    /// Date au format ISO-8601 reconstruite depuis le stamp
    pub created_at: String,
    pub db_path: String,
    pub db_size_bytes: i64,
    /// Si un dossier `documents.pre-restore-{stamp}` existe pour le même horodatage
    pub has_documents: bool,
    pub documents_path: Option<String>,
}

/// Info retournée par `consume_restore_flag` quand une restauration vient juste
/// d'être appliquée — déclenche le toast de bienvenue côté frontend.
#[derive(Serialize)]
pub struct RestoreInfo {
    /// Date au format "YYYY-MM-DD HH:MM:SS" reconstruite depuis le stamp
    pub created_at: String,
}

/// Phase de progression d'une création de sauvegarde, émise via l'event
/// Tauri `backup:progress`. Le frontend affiche une barre déterminée pendant
/// la phase "documents" et un indicateur indéterminé sinon.
#[derive(Clone, Serialize)]
pub struct BackupProgress {
    pub phase: &'static str,
    pub current: i64,
    pub total: i64,
}

/// Nom de l'event Tauri émis pendant `backup_create`
const BACKUP_PROGRESS_EVENT: &str = "backup:progress";

/// Émet un event de progression — erreurs ignorées (purement informatif)
fn emit_progress(app: &AppHandle, phase: &'static str, current: i64, total: i64) {
    let _ = app.emit(
        BACKUP_PROGRESS_EVENT,
        BackupProgress { phase, current, total },
    );
}

/// Pages copiées par appel à `Backup::step` (~400 KB à 4 KB par page)
const SNAPSHOT_PAGES_PER_STEP: i32 = 100;
/// Pause entre deux lots — laisse les autres connexions SQLite passer
const SNAPSHOT_PAUSE_BETWEEN_STEPS: Duration = Duration::from_millis(25);
/// Pause après un retour `Busy`/`Locked` (rare en mode WAL)
const SNAPSHOT_BUSY_BACKOFF: Duration = Duration::from_millis(100);
/// Délai minimum entre deux events `backup:progress` — évite la saturation IPC
/// de WebView2 quand la copie est rapide. La vraie progression reste fluide
/// car l'œil ne distingue pas plus de 12-15 mises à jour/s.
const PROGRESS_THROTTLE: Duration = Duration::from_millis(80);
/// Timeout SQLite si une autre connexion détient un verrou
const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);

/// Réalise un snapshot cohérent de `src_path` vers `dst_path` via l'API Online
/// Backup de SQLite. Cette fonction DOIT être appelée depuis un thread blocking
/// (cf. `tauri::async_runtime::spawn_blocking`) car elle utilise `thread::sleep`
/// et bloque pendant la copie.
///
/// La connexion source est ouverte en lecture seule sur le fichier — hors du
/// `Mutex<Connection>` principal — donc l'app continue à fonctionner pendant.
fn snapshot_database(app: &AppHandle, src_path: &Path, dst_path: &Path) -> Result<(), String> {
    let src = Connection::open_with_flags(
        src_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Ouverture pour snapshot : {}", e))?;
    src.busy_timeout(SQLITE_BUSY_TIMEOUT)
        .map_err(|e| format!("busy_timeout source : {}", e))?;

    let mut dst = Connection::open(dst_path)
        .map_err(|e| format!("Création du fichier de snapshot : {}", e))?;
    dst.busy_timeout(SQLITE_BUSY_TIMEOUT)
        .map_err(|e| format!("busy_timeout destination : {}", e))?;

    let backup = Backup::new(&src, &mut dst)
        .map_err(|e| format!("Initialisation du snapshot : {}", e))?;

    let mut last_emit = Instant::now()
        .checked_sub(PROGRESS_THROTTLE)
        .unwrap_or_else(Instant::now);
    loop {
        let step = backup
            .step(SNAPSHOT_PAGES_PER_STEP)
            .map_err(|e| format!("Snapshot SQLite : {}", e))?;
        match step {
            StepResult::Done => break,
            StepResult::Busy | StepResult::Locked => {
                std::thread::sleep(SNAPSHOT_BUSY_BACKOFF);
            }
            StepResult::More => {
                if last_emit.elapsed() >= PROGRESS_THROTTLE {
                    let p = backup.progress();
                    let total = p.pagecount as i64;
                    let done = total - p.remaining as i64;
                    emit_progress(app, "snapshot", done, total);
                    last_emit = Instant::now();
                }
                std::thread::sleep(SNAPSHOT_PAUSE_BETWEEN_STEPS);
            }
            // StepResult est non-exhaustif côté rusqlite
            _ => std::thread::sleep(SNAPSHOT_BUSY_BACKOFF),
        }
    }
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Helpers ──
// ════════════════════════════════════════════════════════════════════════════

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Impossible de résoudre app_data_dir : {}", e))
}

fn read_schema_version(conn: &Connection) -> Result<i64, String> {
    conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get::<_, i64>(0),
    )
    .map_err(|e| format!("Lecture de schema_migrations : {}", e))
}

/// Vérifie l'intégrité d'une connexion SQLite via `PRAGMA integrity_check`.
/// SQLite retourne "ok" sur la première ligne quand tout va bien, ou une liste
/// de problèmes sinon. On accepte uniquement la valeur exacte "ok".
fn assert_integrity_ok(conn: &Connection) -> Result<(), String> {
    let result: String = conn
        .query_row("PRAGMA integrity_check(1)", [], |row| row.get::<_, String>(0))
        .map_err(|e| format!("integrity_check : {}", e))?;
    if result != "ok" {
        return Err(format!(
            "La base courante échoue le contrôle d'intégrité : {}. Refus de créer une sauvegarde d'une base corrompue.",
            result
        ));
    }
    Ok(())
}

/// Statistiques lues sur un snapshot SQLite ouvert en lecture seule.
struct SnapshotStats {
    etablissement_nom: Option<String>,
    ot_count: i64,
    gammes_count: i64,
    equipements_count: i64,
}

/// Lit les comptes et le nom de l'établissement directement sur le fichier
/// snapshot — garantit la cohérence avec ce qui sera archivé (pas avec la DB
/// courante qui peut avoir bougé entre VACUUM INTO et le calcul).
fn read_snapshot_stats(snapshot_path: &Path) -> Result<SnapshotStats, String> {
    let conn = Connection::open_with_flags(
        snapshot_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Ouverture du snapshot pour stats : {}", e))?;

    let etablissement_nom: Option<String> = conn
        .query_row("SELECT nom FROM etablissements LIMIT 1", [], |row| row.get(0))
        .ok();

    fn count(conn: &Connection, table: &str) -> i64 {
        conn.query_row(&format!("SELECT COUNT(*) FROM {}", table), [], |row| row.get::<_, i64>(0))
            .unwrap_or(0)
    }

    Ok(SnapshotStats {
        etablissement_nom,
        ot_count: count(&conn, "ordres_travail"),
        gammes_count: count(&conn, "gammes"),
        equipements_count: count(&conn, "equipements"),
    })
}

/// Supprime un fichier de snapshot temporaire et ses fichiers compagnons WAL/SHM.
///
/// L'API Online Backup de SQLite copie le journal_mode de la source vers la
/// destination — donc une source en WAL produit un snapshot en WAL, avec ses
/// fichiers `-wal` et `-shm` à côté. Si on ne supprime que le `.db`, les deux
/// autres restent orphelins dans `app_data_dir`.
fn remove_tmp_snapshot(tmp_db: &Path) {
    let _ = fs::remove_file(tmp_db);
    if let (Some(parent), Some(name)) = (tmp_db.parent(), tmp_db.file_name().and_then(|n| n.to_str())) {
        let _ = fs::remove_file(parent.join(format!("{}-wal", name)));
        let _ = fs::remove_file(parent.join(format!("{}-shm", name)));
    }
}

/// Calcule le SHA-256 d'un fichier en streaming (sans le charger en mémoire).
fn sha256_of_file(path: &Path) -> Result<String, String> {
    let mut f = fs::File::open(path)
        .map_err(|e| format!("Ouverture de {} pour hash : {}", path.display(), e))?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| format!("Lecture {} : {}", path.display(), e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let digest = hasher.finalize();
    Ok(digest.iter().map(|b| format!("{:02x}", b)).collect::<String>())
}

/// Compte les fichiers réguliers dans `dir` récursivement
fn count_files_recursive(dir: &Path) -> i64 {
    if !dir.exists() {
        return 0;
    }
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                count += count_files_recursive(&path);
            } else if path.is_file() {
                count += 1;
            }
        }
    }
    count
}

/// Niveau Deflate utilisé partout dans l'archive (DB, manifest, documents).
///
/// Niveau 9 = compression maximale standard zip. La heuristique « Stored sur
/// les PDF/images » a été essayée puis retirée : sur des PDF du monde réel
/// (souvent générés sans flate, ou contenant des images JPEG embarquées sans
/// recompression structurelle), Deflate récupère vraiment 15-25% de taille.
/// Le coût CPU additionnel est absorbé par le pattern `async + spawn_blocking`
/// qui empêche tout freeze UI pendant la compression.
const DEFLATE_LEVEL: i64 = 9;

/// Options de compression appliquées à tous les fichiers de l'archive.
fn deflate_options() -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .compression_level(Some(DEFLATE_LEVEL))
        .unix_permissions(0o644)
}

/// Valide qu'un nom d'entrée de zip est sûr à extraire.
///
/// Rejette tout ce qui pourrait sortir du dossier d'extraction :
/// - chemins absolus (Unix `/foo` ou Windows `C:\foo`, `\\?\foo`)
/// - composants `..` ou `.`
/// - séparateurs Windows `\` (les zip stockent toujours en `/`)
/// - caractères de contrôle (nul-byte notamment)
///
/// Cette validation est **textuelle** car le PathBuf joint n'est pas normalisé
/// par le système de fichiers tant que le fichier n'existe pas — toute
/// vérification a posteriori (canonicalize) est inopérante.
fn validate_zip_entry_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Entrée du zip avec un nom vide".to_string());
    }
    if name.contains('\0') {
        return Err(format!("Nom d'entrée contenant un caractère nul : {}", name));
    }
    if name.contains('\\') {
        return Err(format!("Nom d'entrée contenant un séparateur Windows : {}", name));
    }
    if name.starts_with('/') {
        return Err(format!("Chemin absolu interdit dans le zip : {}", name));
    }
    // Drive letter Windows (ex. "C:" ou "\\?\C:\…" déjà couvert par le check '\')
    if name.len() >= 2 && name.as_bytes()[1] == b':' {
        return Err(format!("Chemin avec lettre de lecteur interdit : {}", name));
    }
    let path = Path::new(name);
    if path.is_absolute() {
        return Err(format!("Chemin absolu interdit dans le zip : {}", name));
    }
    for component in path.components() {
        match component {
            Component::ParentDir => {
                return Err(format!("Composant '..' interdit dans le zip : {}", name));
            }
            Component::CurDir => {
                return Err(format!("Composant '.' interdit dans le zip : {}", name));
            }
            Component::Prefix(_) | Component::RootDir => {
                return Err(format!("Préfixe absolu interdit dans le zip : {}", name));
            }
            Component::Normal(_) => {}
        }
    }
    Ok(())
}

/// Valide qu'un fichier extrait est bien une base SQLite DÉDALE cohérente.
/// Ouverte en lecture seule pour ne pas créer de WAL/SHM dans `pending-restore/`.
fn validate_pending_db(pending_db: &Path, embedded_version: i64) -> Result<(), String> {
    let conn = Connection::open_with_flags(
        pending_db,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|e| format!("Ouverture de la base extraite : {}", e))?;

    // 1) intégrité physique
    let result: String = conn
        .query_row("PRAGMA integrity_check(1)", [], |row| row.get::<_, String>(0))
        .map_err(|e| format!("integrity_check sur la base extraite : {}", e))?;
    if result != "ok" {
        return Err(format!(
            "La base contenue dans la sauvegarde est corrompue ({}). Restauration refusée.",
            result
        ));
    }

    // 2) marqueur DÉDALE (la table types_erp est présente sur toute base initiale)
    let has_marker: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='types_erp'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Vérification du marqueur DÉDALE : {}", e))?;
    if has_marker == 0 {
        return Err("La base extraite ne ressemble pas à une base DÉDALE (table types_erp absente). Restauration refusée.".to_string());
    }

    // 3) version de schéma cohérente : doit avoir au moins la baseline et ne pas
    //    excéder ce que cette version de l'application sait gérer.
    let has_migrations_table: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("Vérification de schema_migrations : {}", e))?;
    if has_migrations_table == 0 {
        return Err("La base extraite ne contient pas la table schema_migrations. Restauration refusée.".to_string());
    }
    let max_version = read_schema_version(&conn)?;
    if max_version < 1 {
        return Err("La base extraite n'a aucune migration appliquée. Restauration refusée.".to_string());
    }
    if max_version > embedded_version {
        return Err(format!(
            "La base extraite est en version de schéma {}, supérieure à ce que l'application sait gérer ({}). Mettez l'application à jour.",
            max_version, embedded_version
        ));
    }

    Ok(())
}

/// Ajoute récursivement le contenu de `current` au zip, sous le préfixe `documents/`,
/// avec des chemins relatifs à `base` (toujours en `/`, jamais en `\`). Compression
/// Deflate niveau 9 sur tous les fichiers (cf. `deflate_options`).
/// `on_file` est appelé après chaque fichier ajouté — utilisé pour émettre la
/// progression via l'event `backup:progress`.
fn add_dir_to_zip(
    zip: &mut ZipWriter<fs::File>,
    base: &Path,
    current: &Path,
    on_file: &mut dyn FnMut(),
) -> Result<(), String> {
    let opts = deflate_options();
    for entry in fs::read_dir(current).map_err(|e| format!("Lecture {} : {}", current.display(), e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let rel = path
            .strip_prefix(base)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let zip_name = format!("{}{}", DOCUMENTS_PREFIX, rel);

        if path.is_dir() {
            add_dir_to_zip(zip, base, &path, on_file)?;
        } else if path.is_file() {
            zip.start_file(zip_name, opts).map_err(|e| e.to_string())?;
            let mut f = fs::File::open(&path)
                .map_err(|e| format!("Ouverture {} : {}", path.display(), e))?;
            std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
            on_file();
        }
    }
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Commandes ──
// ════════════════════════════════════════════════════════════════════════════

/// Crée une archive .zip contenant un snapshot cohérent de la base SQLite (via
/// l'API Online Backup) et de tous les documents liés.
///
/// **Pourquoi `async fn` + `spawn_blocking`** : sur Tauri 2, une commande
/// synchrone non annotée s'exécute sur le main thread du webview (event loop
/// WebView2 sur Windows). Tout `std::thread::sleep` ou opération CPU-bound
/// (compression Deflate, hash SHA-256) sur ce thread fige le rendu UI et
/// déclenche le « Ne répond pas » de Windows. En passant la commande en `async`
/// puis en déléguant le travail bloquant à `tauri::async_runtime::spawn_blocking`,
/// le main thread reste libre de pumper l'event loop et l'UI reste fluide.
#[tauri::command]
pub async fn backup_create(
    app: AppHandle,
    destination_path: String,
) -> Result<BackupInfo, String> {
    let app_for_blocking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_for_blocking.state::<DbPool>();
        backup_create_blocking(&app_for_blocking, &state, destination_path)
    })
    .await
    .map_err(|e| format!("Erreur d'exécution du backup : {}", e))?
}

/// Implémentation bloquante de la création de backup — exécutée dans un thread
/// dédié (`spawn_blocking`) pour ne pas figer le main thread Tauri.
fn backup_create_blocking(
    app: &AppHandle,
    db: &DbPool,
    destination_path: String,
) -> Result<BackupInfo, String> {
    let dest = PathBuf::from(&destination_path);
    let data_dir = app_data(app)?;
    let docs_dir = data_dir.join("documents");

    emit_progress(app, "snapshot", 0, 0);

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S%3f").to_string();
    let tmp_db = data_dir.join(format!(".dedale-backup-tmp-{}.db", stamp));
    let _ = fs::remove_file(&tmp_db);

    // Vérification d'intégrité + lecture de la version — lock SQLite relâché
    // immédiatement (quelques ms).
    let schema_version = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        assert_integrity_ok(&conn)?;
        read_schema_version(&conn)?
    };

    // Snapshot via API Online Backup — copie par lots avec pauses, sur ce
    // thread blocking dédié (n'impacte pas l'UI ni le pool async).
    snapshot_database(app, &data_dir.join("dedale.db"), &tmp_db)?;

    // 2) Construire le manifest (avec hash du snapshot pour détecter une corruption
    //    pendant le transfert ou un stockage cloud peu fiable, et stats lues sur
    //    le snapshot lui-même pour identifier facilement le contenu)
    let db_size = fs::metadata(&tmp_db).map(|m| m.len() as i64).unwrap_or(0);
    let db_sha256 = match sha256_of_file(&tmp_db) {
        Ok(h) => h,
        Err(e) => {
            remove_tmp_snapshot(&tmp_db);
            return Err(e);
        }
    };
    let stats = match read_snapshot_stats(&tmp_db) {
        Ok(s) => s,
        Err(e) => {
            remove_tmp_snapshot(&tmp_db);
            return Err(e);
        }
    };
    let manifest = BackupManifest {
        format_version: FORMAT_VERSION,
        schema_version,
        created_at: chrono::Local::now().to_rfc3339(),
        app_version: APP_VERSION.to_string(),
        db_size_bytes: db_size,
        db_sha256,
        documents_count: count_files_recursive(&docs_dir),
        etablissement_nom: stats.etablissement_nom,
        ot_count: stats.ot_count,
        gammes_count: stats.gammes_count,
        equipements_count: stats.equipements_count,
    };

    // 3) Écrire le zip
    let total_docs = manifest.documents_count;
    let app_for_zip = app.clone();
    let write_result = (|| -> Result<(), String> {
        let file = fs::File::create(&dest)
            .map_err(|e| format!("Création de l'archive : {}", e))?;
        let mut zip = ZipWriter::new(file);

        // manifest.json + dedale.db : très compressibles (texte / SQL) → Deflate
        // au niveau adapté au CPU
        let opts = deflate_options();

        // manifest.json en premier — pour qu'un inspect ne lise que le début du zip
        let manifest_bytes = serde_json::to_vec_pretty(&manifest)
            .map_err(|e| format!("Sérialisation du manifest : {}", e))?;
        zip.start_file(MANIFEST_NAME, opts)
            .map_err(|e| e.to_string())?;
        zip.write_all(&manifest_bytes)
            .map_err(|e| e.to_string())?;

        // dedale.db (le snapshot Online Backup)
        zip.start_file(DB_NAME_IN_ZIP, opts)
            .map_err(|e| e.to_string())?;
        let mut f = fs::File::open(&tmp_db)
            .map_err(|e| format!("Ouverture du snapshot : {}", e))?;
        std::io::copy(&mut f, &mut zip).map_err(|e| e.to_string())?;

        // Phase 2 — Compression des documents avec throttling temporel
        emit_progress(&app_for_zip, "documents", 0, total_docs);
        if docs_dir.exists() {
            let mut current_doc: i64 = 0;
            let app_emit = app_for_zip.clone();
            let mut last_emit = Instant::now()
                .checked_sub(PROGRESS_THROTTLE)
                .unwrap_or_else(Instant::now);
            add_dir_to_zip(&mut zip, &docs_dir, &docs_dir, &mut || {
                current_doc += 1;
                // Throttle par durée plutôt que par count : reste fluide quel
                // que soit le débit (10 fichiers/s ou 1000 fichiers/s)
                if last_emit.elapsed() >= PROGRESS_THROTTLE || current_doc == total_docs {
                    emit_progress(&app_emit, "documents", current_doc, total_docs);
                    last_emit = Instant::now();
                }
            })?;
        }

        // Phase 3 — Finalisation du zip (écriture du Central Directory)
        emit_progress(&app_for_zip, "finalizing", 0, 0);
        zip.finish().map_err(|e| format!("Finalisation du zip : {}", e))?;
        Ok(())
    })();

    // Toujours nettoyer le snapshot temp + ses compagnons WAL/SHM, même en cas d'erreur
    remove_tmp_snapshot(&tmp_db);
    if let Err(e) = write_result {
        // En cas d'échec d'écriture, on évite de laisser un zip à moitié écrit
        let _ = fs::remove_file(&dest);
        // Reset de la progression côté frontend pour libérer l'UI
        emit_progress(&app, "idle", 0, 0);
        return Err(e);
    }

    // Phase finale — succès (le frontend remet la barre à zéro côté UI)
    emit_progress(&app, "done", total_docs, total_docs);

    let total_size = fs::metadata(&dest).map(|m| m.len() as i64).unwrap_or(0);

    // Trace la date de la dernière sauvegarde réussie pour le badge de fraîcheur.
    // Échec silencieux : c'est une info de confort, pas critique pour la création.
    {
        if let Ok(conn) = db.lock() {
            let _ = conn.execute(
                "INSERT INTO parametres_systeme (cle, valeur) VALUES ('derniere_sauvegarde', ?1)
                 ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur",
                rusqlite::params![manifest.created_at],
            );
        }
    }

    Ok(BackupInfo {
        path: destination_path,
        size_bytes: total_size,
        manifest,
    })
}

/// Lit uniquement le manifest d'un zip pour permettre au frontend d'afficher des
/// métadonnées (date, version, taille) avant que l'utilisateur confirme la restauration.
#[tauri::command]
pub fn backup_inspect(zip_path: String) -> Result<BackupManifest, String> {
    let f = fs::File::open(&zip_path)
        .map_err(|e| format!("Ouverture de l'archive : {}", e))?;
    let mut archive =
        ZipArchive::new(f).map_err(|e| format!("Lecture de l'archive : {}", e))?;
    let mut manifest_file = archive.by_name(MANIFEST_NAME).map_err(|_| {
        "L'archive ne contient pas de manifest.json — ce n'est pas une sauvegarde DÉDALE valide.".to_string()
    })?;
    let mut buf = String::new();
    manifest_file
        .read_to_string(&mut buf)
        .map_err(|e| format!("Lecture du manifest : {}", e))?;
    let manifest: BackupManifest = serde_json::from_str(&buf)
        .map_err(|e| format!("Manifest illisible : {}", e))?;

    // Refus immédiat si on ne sait pas lire ce format — évite des comportements
    // indéfinis lors d'une montée de version future.
    if !SUPPORTED_FORMAT_VERSIONS.contains(&manifest.format_version) {
        return Err(format!(
            "Format de sauvegarde non supporté (version {}). Mettez l'application à jour.",
            manifest.format_version
        ));
    }

    Ok(manifest)
}

/// Restaure une archive : extrait DB + documents dans `pending-restore/`, valide
/// la base extraite, puis redémarre l'application. Au prochain boot,
/// `db::apply_pending_restore` swap les fichiers AVANT l'ouverture de la connexion
/// SQLite.
///
/// Sécurité : chaque entrée du zip subit `validate_zip_entry_name` avant d'être
/// écrite — toute tentative de zip-slip (`../`, chemin absolu, etc.) est refusée.
/// La base extraite est ouverte en lecture seule pour vérifier son intégrité,
/// la présence du marqueur DÉDALE, et la cohérence de sa version de schéma. Si
/// l'un de ces checks échoue, le redémarrage est annulé et `pending-restore/` est
/// nettoyé — l'utilisateur reste sur sa base courante intacte.
#[tauri::command]
pub async fn backup_restore(app: AppHandle, zip_path: String) -> Result<(), String> {
    let app_for_blocking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        backup_restore_blocking(&app_for_blocking, zip_path)
    })
    .await
    .map_err(|e| format!("Erreur d'exécution : {}", e))?
}

/// Implémentation bloquante — exécutée dans `spawn_blocking` pour ne pas figer
/// le main thread Tauri pendant l'extraction du zip et le hash SHA-256.
fn backup_restore_blocking(app: &AppHandle, zip_path: String) -> Result<(), String> {
    let data_dir = app_data(app)?;

    // Refus si la sauvegarde provient d'une version plus récente du schéma
    let manifest = backup_inspect(zip_path.clone())?;
    let embedded = db::embedded_schema_version()?;
    if manifest.schema_version > embedded {
        return Err(format!(
            "Sauvegarde incompatible : version de schéma {} alors que cette version de l'application supporte au maximum {}. Mettez l'application à jour avant de restaurer.",
            manifest.schema_version, embedded
        ));
    }

    let pending = data_dir.join("pending-restore");
    if let Err(e) = fs::remove_dir_all(&pending) {
        if e.kind() != io::ErrorKind::NotFound {
            return Err(format!("Nettoyage du pending-restore existant : {}", e));
        }
    }
    fs::create_dir_all(&pending)
        .map_err(|e| format!("Création du dossier pending-restore : {}", e))?;

    let extract_result = (|| -> Result<(), String> {
        let f = fs::File::open(&zip_path)
            .map_err(|e| format!("Ouverture de l'archive : {}", e))?;
        let mut archive =
            ZipArchive::new(f).map_err(|e| format!("Lecture de l'archive : {}", e))?;

        let mut found_db = false;
        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Lecture entrée {} : {}", i, e))?;
            let name = entry.name().to_string();

            if entry.is_dir() {
                continue;
            }
            // Le manifest a déjà été lu via inspect — on ne le réécrit pas
            if name == MANIFEST_NAME {
                continue;
            }

            // Garde-fou anti zip-slip — validation textuelle stricte avant tout
            validate_zip_entry_name(&name)?;

            let target = if name == DB_NAME_IN_ZIP {
                found_db = true;
                pending.join(DB_NAME_IN_ZIP)
            } else if let Some(rel) = name.strip_prefix(DOCUMENTS_PREFIX) {
                // rel a déjà été validé via name (validate_zip_entry_name applique aux composants)
                pending.join("documents").join(rel)
            } else {
                // Entrée inconnue — on ignore plutôt que rejeter, pour la compat future
                continue;
            };

            // Filet de sécurité supplémentaire — la cible doit rester dans pending/
            if !target.starts_with(&pending) {
                return Err(format!("Chemin résolu hors de pending-restore : {}", name));
            }

            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Création {} : {}", parent.display(), e))?;
            }
            let mut out = fs::File::create(&target)
                .map_err(|e| format!("Écriture {} : {}", target.display(), e))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Copie {} : {}", target.display(), e))?;
        }
        if !found_db {
            return Err("L'archive ne contient pas dedale.db — sauvegarde invalide.".to_string());
        }
        Ok(())
    })();

    if let Err(e) = extract_result {
        let _ = fs::remove_dir_all(&pending);
        return Err(e);
    }

    // Vérification d'intégrité par hash — si le SHA-256 du fichier extrait ne
    // correspond pas à celui du manifest, l'archive a été altérée ou corrompue.
    // Sauté pour les backups antérieurs à l'introduction du champ (db_sha256 vide).
    let pending_db = pending.join("dedale.db");
    if !manifest.db_sha256.is_empty() {
        let extracted_hash = sha256_of_file(&pending_db).map_err(|e| {
            let _ = fs::remove_dir_all(&pending);
            e
        })?;
        if extracted_hash != manifest.db_sha256 {
            let _ = fs::remove_dir_all(&pending);
            return Err(format!(
                "Empreinte SHA-256 incorrecte : l'archive est corrompue ou a été altérée (attendu {}, trouvé {}).",
                &manifest.db_sha256[..16.min(manifest.db_sha256.len())],
                &extracted_hash[..16.min(extracted_hash.len())],
            ));
        }
    }

    // Validation de la base extraite avant le redémarrage — si elle est cassée,
    // on annule tout : l'utilisateur reste sur sa base courante intacte.
    if let Err(e) = validate_pending_db(&pending_db, embedded) {
        let _ = fs::remove_dir_all(&pending);
        return Err(e);
    }

    // Tout est validé. En prod : redémarrage immédiat (apply_pending_restore au
    // boot fera le swap). En dev : on demande un redémarrage manuel.
    finalize_restore_or_request_manual_restart(app)
}

/// En production, redémarre l'application : `apply_pending_restore` au boot
/// suivant fera le swap des fichiers et l'app reprend sur la base restaurée.
///
/// En mode développement (`npm run tauri dev`), `app.restart()` désynchronise
/// le tauri-cli (qui orchestre Vite + le binaire) : le webview redémarre mais
/// tape sur `localhost:1420` avant que Vite ne soit prêt et tombe sur
/// `chrome-error://chromewebdata/`. On demande donc à l'utilisateur de relancer
/// manuellement — `pending-restore/` est déjà préparé et sera appliqué au
/// prochain démarrage.
fn finalize_restore_or_request_manual_restart(app: &AppHandle) -> Result<(), String> {
    if cfg!(debug_assertions) {
        return Err(
            "Mode développement : la restauration est prête. Fermez et relancez l'application \
             manuellement pour l'appliquer (limitation connue de `tauri dev` avec `app.restart()`)."
                .to_string(),
        );
    }
    app.restart();
}

// ════════════════════════════════════════════════════════════════════════════
// ── Sauvegardes locales automatiques (pré-restore) ──
// ════════════════════════════════════════════════════════════════════════════

const PRE_RESTORE_DB_PREFIX: &str = "dedale.db.backup-pre-restore-";
const PRE_RESTORE_DOCS_PREFIX: &str = "documents.pre-restore-";

/// Reconstruit une date ISO-8601 lisible à partir d'un horodatage `YYYYMMDD-HHMMSS`.
/// Retourne le stamp brut si le format ne matche pas.
fn iso_from_stamp(stamp: &str) -> String {
    if stamp.len() == 15 && stamp.as_bytes().get(8) == Some(&b'-') {
        let date = &stamp[0..8];
        let time = &stamp[9..15];
        return format!(
            "{}-{}-{} {}:{}:{}",
            &date[0..4],
            &date[4..6],
            &date[6..8],
            &time[0..2],
            &time[2..4],
            &time[4..6]
        );
    }
    stamp.to_string()
}

/// Renvoie la date ISO-8601 de la dernière sauvegarde manuelle réussie, ou None.
#[tauri::command]
pub fn get_derniere_sauvegarde(db: State<DbPool>) -> Result<Option<String>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let result: Option<String> = conn
        .query_row(
            "SELECT valeur FROM parametres_systeme WHERE cle = 'derniere_sauvegarde'",
            [],
            |row| row.get(0),
        )
        .ok();
    Ok(result)
}

/// Liste les sauvegardes pré-restore présentes dans `app_data_dir` — ces fichiers
/// sont créés automatiquement par `apply_pending_restore` avant chaque swap, et
/// servent de filet en cas de regret. Triées du plus récent au plus ancien.
#[tauri::command]
pub fn list_pre_restore_backups(app: AppHandle) -> Result<Vec<LocalPreRestoreBackup>, String> {
    let data_dir = app_data(&app)?;
    let entries = fs::read_dir(&data_dir).map_err(|e| format!("Lecture {} : {}", data_dir.display(), e))?;

    let mut result: Vec<LocalPreRestoreBackup> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        let stamp = match name.strip_prefix(PRE_RESTORE_DB_PREFIX) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let docs = data_dir.join(format!("{}{}", PRE_RESTORE_DOCS_PREFIX, stamp));
        let has_documents = docs.exists() && docs.is_dir();
        let db_size = fs::metadata(&path).map(|m| m.len() as i64).unwrap_or(0);
        result.push(LocalPreRestoreBackup {
            created_at: iso_from_stamp(&stamp),
            stamp,
            db_path: path.to_string_lossy().to_string(),
            db_size_bytes: db_size,
            has_documents,
            documents_path: if has_documents {
                Some(docs.to_string_lossy().to_string())
            } else {
                None
            },
        });
    }
    result.sort_by(|a, b| b.stamp.cmp(&a.stamp));
    Ok(result)
}

/// Restaure une sauvegarde pré-restore identifiée par son horodatage. Place la
/// DB et le dossier documents (s'il existe) dans `pending-restore/` puis redémarre,
/// exactement comme `backup_restore` mais sans passer par un zip.
#[tauri::command]
pub async fn restore_pre_restore(app: AppHandle, stamp: String) -> Result<(), String> {
    let app_for_blocking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        restore_pre_restore_blocking(&app_for_blocking, stamp)
    })
    .await
    .map_err(|e| format!("Erreur d'exécution : {}", e))?
}

fn restore_pre_restore_blocking(app: &AppHandle, stamp: String) -> Result<(), String> {
    let data_dir = app_data(app)?;
    let src_db = data_dir.join(format!("{}{}", PRE_RESTORE_DB_PREFIX, stamp));
    if !src_db.exists() {
        return Err(format!("Sauvegarde pré-restore introuvable pour {}", stamp));
    }

    // Validation préalable de la base avant d'engager le swap
    let embedded = db::embedded_schema_version()?;
    validate_pending_db(&src_db, embedded)?;

    let pending = data_dir.join("pending-restore");
    if let Err(e) = fs::remove_dir_all(&pending) {
        if e.kind() != io::ErrorKind::NotFound {
            return Err(format!("Nettoyage pending-restore existant : {}", e));
        }
    }
    fs::create_dir_all(&pending)
        .map_err(|e| format!("Création pending-restore : {}", e))?;

    fs::copy(&src_db, pending.join("dedale.db"))
        .map_err(|e| format!("Copie de la DB pré-restore : {}", e))?;

    // Si un dossier documents associé existe, on le copie aussi
    let src_docs = data_dir.join(format!("{}{}", PRE_RESTORE_DOCS_PREFIX, stamp));
    if src_docs.exists() && src_docs.is_dir() {
        copy_dir_recursive(&src_docs, &pending.join("documents"))
            .map_err(|e| format!("Copie des documents pré-restore : {}", e))?;
    }

    finalize_restore_or_request_manual_restart(app)
}

/// Copie récursive d'un dossier — équivalent shell `cp -r`. La crate std n'offre
/// pas de helper direct ; on évite d'ajouter une dépendance pour si peu.
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

/// Lit (et consomme) le marqueur `.last-restore-marker` déposé par
/// `apply_pending_restore` au boot suivant un swap. Si présent, retourne le stamp
/// et supprime le marqueur — le frontend affiche alors un toast de bienvenue.
#[tauri::command]
pub fn consume_restore_flag(app: AppHandle) -> Result<Option<RestoreInfo>, String> {
    let data_dir = app_data(&app)?;
    let marker = data_dir.join(db::RESTORE_MARKER_NAME);
    if !marker.exists() {
        return Ok(None);
    }
    let stamp = fs::read_to_string(&marker).unwrap_or_default();
    let _ = fs::remove_file(&marker);
    let stamp = stamp.trim();
    if stamp.is_empty() {
        return Ok(None);
    }
    Ok(Some(RestoreInfo { created_at: iso_from_stamp(stamp) }))
}

/// Ouvre le dossier `app_data_dir` dans l'explorateur de fichiers du système.
/// Utilisé pour permettre à l'utilisateur d'aller copier manuellement un backup
/// pré-restore sur un disque externe ou de vérifier les fichiers présents.
#[tauri::command]
pub fn open_app_data_dir(app: AppHandle) -> Result<(), String> {
    let data_dir = app_data(&app)?;
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("Création {} : {}", data_dir.display(), e))?;

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer.exe")
        .arg(&data_dir)
        .spawn();

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&data_dir).spawn();

    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(&data_dir).spawn();

    result
        .map(|_| ())
        .map_err(|e| format!("Ouverture de l'explorateur : {}", e))
}
