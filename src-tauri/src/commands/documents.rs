use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::params;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tauri::{Manager, State};

use crate::db::DbPool;
use crate::models::documents::{Document, DocumentAggrege, DocumentLie, DocumentListItem, DocumentUploadInput};

// ════════════════════════════════════════════════════════════════════════════
// ── Utilitaire : résoudre le répertoire de stockage des documents ──
// ════════════════════════════════════════════════════════════════════════════

/// Formats acceptés à l'upload
const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "webp"];

/// Retourne le chemin du répertoire racine de stockage des documents
fn documents_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Impossible de résoudre app_data_dir : {}", e))?;
    Ok(base.join("documents"))
}

/// Extrait l'extension d'un nom de fichier (minuscule, sans le point)
fn extract_extension(nom: &str) -> String {
    std::path::Path::new(nom)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase()
}

/// Détecte le format d'un fichier à partir de ses magic bytes
fn detect_format_from_bytes(bytes: &[u8]) -> Option<&'static str> {
    if bytes.len() < 4 { return None; }
    if bytes.starts_with(b"%PDF") { return Some("pdf"); }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) { return Some("jpg"); }
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) { return Some("png"); }
    if bytes.starts_with(b"GIF8") { return Some("gif"); }
    if bytes.starts_with(&[0x42, 0x4D]) { return Some("bmp"); }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" { return Some("webp"); }
    None
}

/// Détermine le format d'un fichier : d'abord par extension, sinon par magic bytes
fn resolve_format(nom: &str, bytes: &[u8]) -> Result<String, String> {
    let ext = extract_extension(nom);
    if !ext.is_empty() && (ext == "pdf" || IMAGE_EXTENSIONS.contains(&ext.as_str())) {
        return Ok(ext);
    }
    // Extension absente ou non reconnue → détecter par contenu
    if let Some(detected) = detect_format_from_bytes(bytes) {
        return Ok(detected.to_string());
    }
    Err(format!(
        "Format non reconnu pour « {} ». Seuls les PDF et les images (JPG, PNG, GIF, BMP, WebP) sont acceptés.",
        nom
    ))
}

/// Dimension maximale (largeur ou hauteur) des images stockées
const MAX_IMAGE_DIMENSION: u32 = 1800;

/// Qualité WebP lossy (0.0 à 100.0) — 60% = bon compromis qualité/poids
const WEBP_QUALITY: f32 = 60.0;

/// Convertit une image en WebP lossy 60%, redimensionnée à 1800px max.
fn convert_to_webp(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut img = image::load_from_memory(bytes)
        .map_err(|e| format!("Impossible de décoder l'image : {}", e))?;
    // Redimensionner si un côté dépasse 1800px (conserve le ratio)
    let (w, h) = (img.width(), img.height());
    if w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION {
        img = img.resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, image::imageops::FilterType::Lanczos3);
    }
    // Encoder en WebP lossy via libwebp
    let encoder = webp::Encoder::from_image(&img)
        .map_err(|e| format!("Erreur d'encodage WebP : {}", e))?;
    let memory = encoder.encode(WEBP_QUALITY);
    Ok(memory.to_vec())
}

/// Traite les octets d'un fichier uploadé :
/// - PDF → retourne tel quel avec extension "pdf"
/// - Image → convertit en WebP lossy et retourne avec extension "webp"
fn process_file(bytes: &[u8], ext: &str) -> Result<(Vec<u8>, String), String> {
    if ext == "pdf" {
        return Ok((bytes.to_vec(), "pdf".to_string()));
    }
    // C'est une image → conversion WebP
    let webp_bytes = convert_to_webp(bytes)?;
    Ok((webp_bytes, "webp".to_string()))
}

/// Charge un Document depuis la base par son ID (évite la duplication du SELECT+mapping)
fn fetch_document(conn: &rusqlite::Connection, id: i64) -> Result<Document, String> {
    conn.query_row(
        "SELECT id_document, nom_original, hash_sha256, nom_fichier, taille_octets, \
                id_type_document, date_upload \
         FROM documents WHERE id_document = ?1",
        params![id],
        |row| {
            Ok(Document {
                id_document: row.get(0)?,
                nom_original: row.get(1)?,
                hash_sha256: row.get(2)?,
                nom_fichier: row.get(3)?,
                taille_octets: row.get(4)?,
                id_type_document: row.get(5)?,
                date_upload: row.get(6)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Upload, lecture, téléchargement, suppression ──
// ════════════════════════════════════════════════════════════════════════════

/// Résultat du traitement lourd (décodage + conversion) exécuté hors thread principal
struct ProcessedFile {
    bytes: Vec<u8>,
    storage_ext: String,
    hash: String,
    taille: i64,
}

/// Décode, valide, convertit et hashe un fichier — conçu pour spawn_blocking
fn process_upload(data_base64: &str, nom_original: &str) -> Result<ProcessedFile, String> {
    let raw_bytes = BASE64
        .decode(data_base64)
        .map_err(|e| format!("Erreur de décodage base64 : {}", e))?;

    if raw_bytes.is_empty() {
        return Err("Le fichier est vide".to_string());
    }

    let resolved_ext = resolve_format(nom_original, &raw_bytes)?;

    let (bytes, storage_ext) = process_file(&raw_bytes, &resolved_ext)?;
    let taille = bytes.len() as i64;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = format!("{:x}", hasher.finalize());

    Ok(ProcessedFile { bytes, storage_ext, hash, taille })
}

/// Upload un document : décode le base64, calcule le SHA-256,
/// écrit le fichier sur disque, insère les métadonnées en base.
/// Asynchrone pour ne pas bloquer l'UI pendant la conversion d'image.
#[tauri::command]
pub async fn upload_document(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    input: DocumentUploadInput,
) -> Result<Document, String> {
    // Travail lourd dans un thread séparé (décodage + resize + encodage WebP)
    let data = input.data_base64.clone();
    let nom = input.nom_original.clone();
    let processed = tauri::async_runtime::spawn_blocking(move || process_upload(&data, &nom))
        .await
        .map_err(|e| format!("Erreur interne : {}", e))??;

    // Vérifier que le hash n'existe pas déjà en base
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM documents WHERE hash_sha256 = ?1",
                params![processed.hash],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
            > 0;
        if exists {
            return Err("Ce fichier existe déjà (même contenu détecté via empreinte SHA-256).".to_string());
        }
    }

    // Déterminer le chemin de stockage
    let prefix = &processed.hash[0..2];
    let docs_dir = documents_dir(&app)?;
    let target_dir = docs_dir.join(prefix);
    let nom_fichier = format!("{}/{}.{}", prefix, processed.hash, processed.storage_ext);
    let file_path = target_dir.join(format!("{}.{}", processed.hash, processed.storage_ext));

    // Créer le répertoire et écrire le fichier
    fs::create_dir_all(&target_dir)
        .map_err(|e| format!("Impossible de créer le répertoire de stockage : {}", e))?;
    fs::write(&file_path, &processed.bytes)
        .map_err(|e| format!("Impossible d'écrire le fichier : {}", e))?;

    // Adapter le nom original si le format a changé (ex: .png → .webp)
    let display_name = if processed.storage_ext != "pdf" {
        match input.nom_original.rfind('.') {
            Some(pos) => format!("{}.{}", &input.nom_original[..pos], processed.storage_ext),
            None => format!("{}.{}", input.nom_original, processed.storage_ext),
        }
    } else {
        input.nom_original.clone()
    };

    // Insérer les métadonnées en base
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO documents (nom_original, hash_sha256, nom_fichier, taille_octets, id_type_document) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![display_name, processed.hash, nom_fichier, processed.taille, input.id_type_document],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    fetch_document(&conn, id)
}

/// Récupère la liste de tous les documents avec le nom du type et le nombre de liaisons
#[tauri::command]
pub fn get_documents(db: State<DbPool>) -> Result<Vec<DocumentListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT d.id_document, d.nom_original, d.taille_octets, d.id_type_document, \
                    td.nom AS nom_type, d.date_upload, \
                    ( \
                        (SELECT COUNT(*) FROM documents_prestataires dp WHERE dp.id_document = d.id_document) + \
                        (SELECT COUNT(*) FROM documents_ordres_travail dot WHERE dot.id_document = d.id_document) + \
                        (SELECT COUNT(*) FROM documents_gammes dg WHERE dg.id_document = d.id_document) + \
                        (SELECT COUNT(*) FROM documents_contrats dc WHERE dc.id_document = d.id_document) + \
                        (SELECT COUNT(*) FROM documents_di ddi WHERE ddi.id_document = d.id_document) + \
                        (SELECT COUNT(*) FROM documents_localisations dl WHERE dl.id_document = d.id_document) + \
                        (SELECT COUNT(*) FROM documents_equipements de WHERE de.id_document = d.id_document) + \
                        (SELECT COUNT(*) FROM documents_techniciens dt WHERE dt.id_document = d.id_document) \
                    ) AS nb_liaisons \
             FROM documents d \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             ORDER BY d.date_upload DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(DocumentListItem {
                id_document: row.get(0)?,
                nom_original: row.get(1)?,
                taille_octets: row.get(2)?,
                id_type_document: row.get(3)?,
                nom_type: row.get(4)?,
                date_upload: row.get(5)?,
                nb_liaisons: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère les documents liés à une entité donnée (prestataire, OT, gamme, etc.)
/// Pour les équipements : retourne aussi les documents hérités des gammes et OT liés
#[tauri::command]
pub fn get_documents_for_entity(
    db: State<DbPool>,
    entity_type: String,
    entity_id: i64,
) -> Result<Vec<DocumentLie>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Cas spécial équipements : documents directs + hérités gammes/OT
    if entity_type == "equipements" {
        return get_documents_equipement_complet(&conn, entity_id);
    }

    // Déterminer la table de liaison et la colonne FK selon le type d'entité
    let (table, col) = match entity_type.as_str() {
        "prestataires" => ("documents_prestataires", "id_prestataire"),
        "ordres_travail" => ("documents_ordres_travail", "id_ordre_travail"),
        "gammes" => ("documents_gammes", "id_gamme"),
        "contrats" => ("documents_contrats", "id_contrat"),
        "di" => ("documents_di", "id_di"),
        "localisations" => ("documents_localisations", "id_local"),
        "techniciens" => ("documents_techniciens", "id_technicien"),
        _ => return Err(format!("Type d'entité inconnu : {}", entity_type)),
    };

    let sql = format!(
        "SELECT d.id_document, d.nom_original, d.taille_octets, td.nom AS nom_type, \
                d.date_upload, j.date_liaison, j.commentaire, NULL AS source \
         FROM {} j \
         JOIN documents d ON d.id_document = j.id_document \
         JOIN types_documents td ON td.id_type_document = d.id_type_document \
         WHERE j.{} = ?1 \
         ORDER BY j.date_liaison DESC",
        table, col
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![entity_id], |row| {
            Ok(DocumentLie {
                id_document: row.get(0)?,
                nom_original: row.get(1)?,
                taille_octets: row.get(2)?,
                nom_type: row.get(3)?,
                date_upload: row.get(4)?,
                date_liaison: row.get(5)?,
                commentaire: row.get(6)?,
                source: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Documents d'un équipement : directs (source=null) + gammes + OT (source='Gamme : ...' / 'OT : ...')
fn get_documents_equipement_complet(conn: &rusqlite::Connection, id_equipement: i64) -> Result<Vec<DocumentLie>, String> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT d.id_document, d.nom_original, d.taille_octets, td.nom, \
                    d.date_upload, j.date_liaison, j.commentaire, NULL AS source \
             FROM documents_equipements j \
             JOIN documents d ON d.id_document = j.id_document \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             WHERE j.id_equipement = ?1 \
             UNION ALL \
             SELECT d.id_document, d.nom_original, d.taille_octets, td.nom, \
                    d.date_upload, dg.date_liaison, NULL, 'Gamme : ' || g.nom_gamme \
             FROM documents_gammes dg \
             JOIN documents d ON d.id_document = dg.id_document \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             JOIN gammes g ON dg.id_gamme = g.id_gamme \
             JOIN gammes_equipements ge ON ge.id_gamme = g.id_gamme \
             WHERE ge.id_equipement = ?1 \
             UNION ALL \
             SELECT d.id_document, d.nom_original, d.taille_octets, td.nom, \
                    d.date_upload, dot.date_liaison, NULL, 'OT : ' || ot.nom_gamme \
             FROM documents_ordres_travail dot \
             JOIN documents d ON d.id_document = dot.id_document \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             JOIN ordres_travail ot ON dot.id_ordre_travail = ot.id_ordre_travail \
             JOIN gammes_equipements ge ON ge.id_gamme = ot.id_gamme \
             WHERE ge.id_equipement = ?1 \
             ORDER BY source IS NULL DESC, source, d.nom_original",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![id_equipement], |row| {
            Ok(DocumentLie {
                id_document: row.get(0)?,
                nom_original: row.get(1)?,
                taille_octets: row.get(2)?,
                nom_type: row.get(3)?,
                date_upload: row.get(4)?,
                date_liaison: row.get(5)?,
                commentaire: row.get(6)?,
                source: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère tous les documents liés à un prestataire : directs + gammes + OT
#[tauri::command]
pub fn get_documents_prestataire_agregat(
    db: State<DbPool>,
    id_prestataire: i64,
) -> Result<Vec<DocumentAggrege>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT d.id_document, d.nom_original, d.taille_octets, td.nom, d.date_upload, 'Gamme : ' || g.nom_gamme AS source \
             FROM documents_gammes dg \
             JOIN documents d ON d.id_document = dg.id_document \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             JOIN gammes g ON dg.id_gamme = g.id_gamme \
             WHERE g.id_prestataire = ?1 \
             UNION ALL \
             SELECT d.id_document, d.nom_original, d.taille_octets, td.nom, d.date_upload, 'OT : ' || ot.nom_gamme AS source \
             FROM documents_ordres_travail dot \
             JOIN documents d ON d.id_document = dot.id_document \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             JOIN ordres_travail ot ON dot.id_ordre_travail = ot.id_ordre_travail \
             WHERE ot.id_prestataire = ?1 \
             ORDER BY source, d.nom_original",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_prestataire], |row| {
            Ok(DocumentAggrege {
                id_document: row.get(0)?,
                nom_original: row.get(1)?,
                taille_octets: row.get(2)?,
                nom_type: row.get(3)?,
                date_upload: row.get(4)?,
                source: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Télécharge le contenu d'un document (retourne les octets encodés en base64)
/// Utilisé pour la prévisualisation et le téléchargement côté frontend
#[tauri::command]
pub fn download_document(
    app: tauri::AppHandle,
    db: State<DbPool>,
    id: i64,
) -> Result<String, String> {
    let nom_fichier: String = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT nom_fichier FROM documents WHERE id_document = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Document introuvable (id={}) : {}", id, e))?
    };

    let docs_dir = documents_dir(&app)?;
    let file_path = docs_dir.join(&nom_fichier);
    let bytes = fs::read(&file_path)
        .map_err(|e| format!("Impossible de lire le fichier {} : {}", nom_fichier, e))?;

    Ok(BASE64.encode(&bytes))
}

/// Sauvegarde un document vers un chemin choisi par l'utilisateur
#[tauri::command]
pub fn save_document_to(
    app: tauri::AppHandle,
    db: State<DbPool>,
    id: i64,
    destination: String,
) -> Result<(), String> {
    let nom_fichier: String = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT nom_fichier FROM documents WHERE id_document = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Document introuvable (id={}) : {}", id, e))?
    };

    let docs_dir = documents_dir(&app)?;
    let source = docs_dir.join(&nom_fichier);
    fs::copy(&source, &destination)
        .map_err(|e| format!("Impossible de copier le fichier : {}", e))?;
    Ok(())
}

/// Supprime un document : supprime le fichier physique et les métadonnées en base
/// (les liaisons sont supprimées en cascade par les FK)
#[tauri::command]
pub fn delete_document(
    app: tauri::AppHandle,
    db: State<DbPool>,
    id: i64,
) -> Result<(), String> {
    // Récupérer le chemin relatif du fichier avant suppression en base
    let nom_fichier: String = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT nom_fichier FROM documents WHERE id_document = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Document introuvable (id={}) : {}", id, e))?
    };

    // Supprimer l'enregistrement en base (cascade supprime les liaisons)
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let affected = conn
            .execute("DELETE FROM documents WHERE id_document = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if affected == 0 {
            return Err(format!("Document introuvable (id={})", id));
        }
    }

    // Supprimer le fichier physique (ne pas échouer si le fichier n'existe plus)
    let docs_dir = documents_dir(&app)?;
    let file_path = docs_dir.join(&nom_fichier);
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| {
            format!(
                "Métadonnées supprimées mais erreur lors de la suppression du fichier : {}",
                e
            )
        })?;
    }

    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Modification de document ──
// ════════════════════════════════════════════════════════════════════════════

/// Met à jour le nom et/ou le type d'un document (sans toucher au fichier)
#[tauri::command]
pub fn update_document(
    db: State<DbPool>,
    id: i64,
    nom_original: Option<String>,
    id_type_document: Option<i64>,
) -> Result<Document, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    if let Some(ref nom) = nom_original {
        conn.execute(
            "UPDATE documents SET nom_original = ?1 WHERE id_document = ?2",
            params![nom, id],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(type_id) = id_type_document {
        conn.execute(
            "UPDATE documents SET id_type_document = ?1 WHERE id_document = ?2",
            params![type_id, id],
        )
        .map_err(|e| e.to_string())?;
    }

    fetch_document(&conn, id)
}

/// Remplace le fichier d'un document existant (garde l'ID et toutes les liaisons).
/// Asynchrone pour ne pas bloquer l'UI pendant la conversion d'image.
#[tauri::command]
pub async fn replace_document_file(
    app: tauri::AppHandle,
    db: State<'_, DbPool>,
    id: i64,
    data_base64: String,
) -> Result<Document, String> {
    // Récupérer l'ancien document
    let (old_nom_fichier, old_nom_original): (String, String) = {
        let conn = db.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT nom_fichier, nom_original FROM documents WHERE id_document = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("Document introuvable (id={}) : {}", id, e))?
    };

    // Travail lourd dans un thread séparé
    let nom = old_nom_original.clone();
    let processed = tauri::async_runtime::spawn_blocking(move || process_upload(&data_base64, &nom))
        .await
        .map_err(|e| format!("Erreur interne : {}", e))??;

    let new_hash = processed.hash;
    let bytes = processed.bytes;
    let storage_ext = processed.storage_ext;
    let taille = processed.taille;

    // Vérifier que le hash n'existe pas déjà pour un AUTRE document
    {
        let conn = db.lock().map_err(|e| e.to_string())?;
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM documents WHERE hash_sha256 = ?1 AND id_document != ?2",
                params![new_hash, id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?
            > 0;
        if exists {
            return Err("Un autre document avec le même contenu existe déjà.".to_string());
        }
    }

    // Déterminer le chemin de stockage
    let prefix = &new_hash[0..2];
    let docs_dir = documents_dir(&app)?;
    let new_nom_fichier = format!("{}/{}.{}", prefix, new_hash, storage_ext);
    let new_file_path = docs_dir.join(&new_nom_fichier);

    // Écrire le nouveau fichier
    let new_target_dir = docs_dir.join(prefix);
    fs::create_dir_all(&new_target_dir)
        .map_err(|e| format!("Impossible de créer le répertoire : {}", e))?;
    fs::write(&new_file_path, &bytes)
        .map_err(|e| format!("Impossible d'écrire le fichier : {}", e))?;

    // Supprimer l'ancien fichier physique (si différent)
    let old_file_path = docs_dir.join(&old_nom_fichier);
    if old_file_path != new_file_path && old_file_path.exists() {
        let _ = fs::remove_file(&old_file_path);
    }

    // Mettre à jour les métadonnées en base
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE documents SET hash_sha256 = ?1, nom_fichier = ?2, taille_octets = ?3 \
         WHERE id_document = ?4",
        params![new_hash, new_nom_fichier, taille, id],
    )
    .map_err(|e| e.to_string())?;

    fetch_document(&conn, id)
}

// ════════════════════════════════════════════════════════════════════════════
// ── Helpers génériques pour liaison/dissociation documents ──
// ════════════════════════════════════════════════════════════════════════════

/// Insère une liaison document ↔ entité dans la table spécifiée.
/// # Sécurité SQL
/// `table` et `id_col` sont concaténés dans le SQL — tous les appels
/// doivent utiliser des littéraux hardcodés, jamais d'input utilisateur.
fn link_document_to(
    conn: &rusqlite::Connection,
    table: &str,
    id_col: &str,
    id_document: i64,
    id_entity: i64,
    commentaire: Option<String>,
) -> Result<(), String> {
    let sql = format!(
        "INSERT INTO {} (id_document, {}, commentaire) VALUES (?1, ?2, ?3)",
        table, id_col
    );
    conn.execute(&sql, params![id_document, id_entity, commentaire])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime une liaison document ↔ entité dans la table spécifiée.
/// Même contrainte de sécurité que `link_document_to`.
fn unlink_document_from(
    conn: &rusqlite::Connection,
    table: &str,
    id_col: &str,
    id_document: i64,
    id_entity: i64,
) -> Result<(), String> {
    let sql = format!(
        "DELETE FROM {} WHERE id_document = ?1 AND {} = ?2",
        table, id_col
    );
    conn.execute(&sql, params![id_document, id_entity])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Liaison documents ↔ entités (commandes Tauri) ──
// ════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn link_document_prestataire(
    db: State<DbPool>, id_document: i64, id_prestataire: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    link_document_to(&conn, "documents_prestataires", "id_prestataire", id_document, id_prestataire, commentaire)
}

#[tauri::command]
pub fn unlink_document_prestataire(
    db: State<DbPool>, id_document: i64, id_prestataire: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_prestataires", "id_prestataire", id_document, id_prestataire)
}

#[tauri::command]
pub fn link_document_ordre_travail(
    db: State<DbPool>, id_document: i64, id_ordre_travail: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    link_document_to(&conn, "documents_ordres_travail", "id_ordre_travail", id_document, id_ordre_travail, commentaire)
}

#[tauri::command]
pub fn unlink_document_ordre_travail(
    db: State<DbPool>, id_document: i64, id_ordre_travail: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_ordres_travail", "id_ordre_travail", id_document, id_ordre_travail)
}

#[tauri::command]
pub fn link_document_gamme(
    db: State<DbPool>, id_document: i64, id_gamme: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    link_document_to(&conn, "documents_gammes", "id_gamme", id_document, id_gamme, commentaire)
}

#[tauri::command]
pub fn unlink_document_gamme(
    db: State<DbPool>, id_document: i64, id_gamme: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_gammes", "id_gamme", id_document, id_gamme)
}

/// Bloqué si contrat archivé
#[tauri::command]
pub fn link_document_contrat(
    db: State<DbPool>, id_document: i64, id_contrat: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let est_archive: i64 = conn
        .query_row("SELECT est_archive FROM contrats WHERE id_contrat = ?1", params![id_contrat], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if est_archive == 1 {
        return Err("Impossible de lier un document à un contrat archivé.".to_string());
    }
    link_document_to(&conn, "documents_contrats", "id_contrat", id_document, id_contrat, commentaire)
}

#[tauri::command]
pub fn unlink_document_contrat(
    db: State<DbPool>, id_document: i64, id_contrat: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_contrats", "id_contrat", id_document, id_contrat)
}

/// Bloqué si DI résolue
#[tauri::command]
pub fn link_document_di(
    db: State<DbPool>, id_document: i64, id_di: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let statut: i64 = conn
        .query_row("SELECT id_statut_di FROM demandes_intervention WHERE id_di = ?1", params![id_di], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if statut == 2 {
        return Err("Impossible de lier un document à une DI résolue. Réouvrez-la d'abord.".to_string());
    }
    link_document_to(&conn, "documents_di", "id_di", id_document, id_di, commentaire)
}

#[tauri::command]
pub fn unlink_document_di(
    db: State<DbPool>, id_document: i64, id_di: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_di", "id_di", id_document, id_di)
}

#[tauri::command]
pub fn link_document_localisation(
    db: State<DbPool>, id_document: i64, id_local: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    link_document_to(&conn, "documents_localisations", "id_local", id_document, id_local, commentaire)
}

#[tauri::command]
pub fn unlink_document_localisation(
    db: State<DbPool>, id_document: i64, id_local: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_localisations", "id_local", id_document, id_local)
}

#[tauri::command]
pub fn link_document_equipement(
    db: State<DbPool>, id_document: i64, id_equipement: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    link_document_to(&conn, "documents_equipements", "id_equipement", id_document, id_equipement, commentaire)
}

#[tauri::command]
pub fn unlink_document_equipement(
    db: State<DbPool>, id_document: i64, id_equipement: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_equipements", "id_equipement", id_document, id_equipement)
}

/// Récupère les documents agrégés pour un équipement : gammes liées + OT liés
#[tauri::command]
pub fn get_documents_equipement_agregat(
    db: State<DbPool>,
    id_equipement: i64,
) -> Result<Vec<DocumentAggrege>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT d.id_document, d.nom_original, d.taille_octets, td.nom, d.date_upload, \
                    'Gamme : ' || g.nom_gamme AS source \
             FROM documents_gammes dg \
             JOIN documents d ON d.id_document = dg.id_document \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             JOIN gammes g ON dg.id_gamme = g.id_gamme \
             JOIN gammes_equipements ge ON ge.id_gamme = g.id_gamme \
             WHERE ge.id_equipement = ?1 \
             UNION ALL \
             SELECT d.id_document, d.nom_original, d.taille_octets, td.nom, d.date_upload, \
                    'OT : ' || ot.nom_gamme AS source \
             FROM documents_ordres_travail dot \
             JOIN documents d ON d.id_document = dot.id_document \
             JOIN types_documents td ON td.id_type_document = d.id_type_document \
             JOIN ordres_travail ot ON dot.id_ordre_travail = ot.id_ordre_travail \
             JOIN gammes_equipements ge ON ge.id_gamme = ot.id_gamme \
             WHERE ge.id_equipement = ?1 \
             ORDER BY source, d.nom_original",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_equipement], |row| {
            Ok(DocumentAggrege {
                id_document: row.get(0)?,
                nom_original: row.get(1)?,
                taille_octets: row.get(2)?,
                nom_type: row.get(3)?,
                date_upload: row.get(4)?,
                source: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ── Techniciens ──

#[tauri::command]
pub fn link_document_technicien(
    db: State<DbPool>, id_document: i64, id_technicien: i64, commentaire: Option<String>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    link_document_to(&conn, "documents_techniciens", "id_technicien", id_document, id_technicien, commentaire)
}

#[tauri::command]
pub fn unlink_document_technicien(
    db: State<DbPool>, id_document: i64, id_technicien: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    unlink_document_from(&conn, "documents_techniciens", "id_technicien", id_document, id_technicien)
}

// ════════════════════════════════════════════════════════════════════════════
// ── Synchronisation documents disque ↔ base au démarrage ──
// ════════════════════════════════════════════════════════════════════════════

/// Synchronise les fichiers sur disque avec la base de données :
/// - Supprime les fichiers orphelins (sur disque mais absents en base)
/// - Supprime les entrées fantômes (en base mais fichier disparu sur disque)
pub fn sync_documents(conn: &rusqlite::Connection, docs_dir: &std::path::Path) -> Result<(), String> {
    let mut stmt = conn
        .prepare("SELECT id_document, nom_fichier FROM documents")
        .map_err(|e| format!("Erreur lecture documents : {}", e))?;
    let db_rows: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let db_files: std::collections::HashSet<String> =
        db_rows.iter().map(|(_, f)| f.clone()).collect();

    // ── 1. Supprimer les fichiers orphelins sur disque ──
    let mut orphans_deleted = 0u32;
    if docs_dir.exists() {
        for entry in walk_files(docs_dir) {
            let rel = entry
                .strip_prefix(docs_dir)
                .unwrap_or(&entry)
                .to_string_lossy()
                .replace('\\', "/");
            if !db_files.contains(&rel) {
                let _ = fs::remove_file(&entry);
                orphans_deleted += 1;
            }
        }
        // Nettoyer les sous-dossiers vides
        cleanup_empty_dirs(docs_dir);
    }

    // ── 2. Supprimer les entrées fantômes en base ──
    let mut phantoms_deleted = 0u32;
    for (id, nom_fichier) in &db_rows {
        let file_path = docs_dir.join(nom_fichier);
        if !file_path.exists() {
            let _ = conn.execute(
                "DELETE FROM documents WHERE id_document = ?1",
                rusqlite::params![id],
            );
            phantoms_deleted += 1;
        }
    }

    if orphans_deleted > 0 || phantoms_deleted > 0 {
        log::info!(
            "Sync documents : {} fichier(s) orphelin(s) supprimé(s), {} entrée(s) fantôme(s) supprimée(s)",
            orphans_deleted,
            phantoms_deleted
        );
    }

    Ok(())
}

/// Parcourt récursivement un répertoire et retourne tous les chemins de fichiers
fn walk_files(dir: &std::path::Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                files.extend(walk_files(&path));
            } else {
                files.push(path);
            }
        }
    }
    files
}

/// Supprime les sous-dossiers vides (préfixes de hash)
fn cleanup_empty_dirs(dir: &std::path::Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if fs::read_dir(&path).map(|mut e| e.next().is_none()).unwrap_or(false) {
                    let _ = fs::remove_dir(&path);
                }
            }
        }
    }
}
