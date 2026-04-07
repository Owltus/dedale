use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::images::{Image, ImageInput, ImageLibraryItem};

const IMAGE_COLS: &str = "id_image, nom, description, image_data, image_mime, taille_octets, date_creation";

fn row_to_image(row: &rusqlite::Row) -> rusqlite::Result<Image> {
    let data: Vec<u8> = row.get(3)?;
    Ok(Image {
        id_image: row.get(0)?,
        nom: row.get(1)?,
        description: row.get(2)?,
        image_data_base64: BASE64.encode(&data),
        image_mime: row.get(4)?,
        taille_octets: row.get(5)?,
        date_creation: row.get(6)?,
    })
}

#[tauri::command]
pub fn upload_image(db: State<DbPool>, input: ImageInput) -> Result<Image, String> {
    let blob = BASE64
        .decode(&input.image_data_base64)
        .map_err(|e| format!("Erreur de décodage base64 : {}", e))?;
    let taille = blob.len() as i64;

    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO images (nom, description, image_data, image_mime, taille_octets)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![input.nom, input.description, blob, input.image_mime, taille],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM images WHERE id_image = ?1", IMAGE_COLS);
    conn.query_row(&sql, params![id], row_to_image)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_image(db: State<DbPool>, id: i64) -> Result<Image, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM images WHERE id_image = ?1", IMAGE_COLS);
    conn.query_row(&sql, params![id], row_to_image)
        .map_err(|e| format!("Image introuvable (id={}) : {}", id, e))
}

#[tauri::command]
pub fn get_images(db: State<DbPool>) -> Result<Vec<ImageLibraryItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT i.id_image, i.nom, i.description, i.image_data, i.image_mime, i.taille_octets, i.date_creation, \
             COALESCE( \
               (SELECT GROUP_CONCAT(nom, ', ') FROM ( \
                 SELECT nom_domaine AS nom FROM domaines_gammes WHERE id_image = i.id_image \
                 UNION ALL SELECT nom_famille FROM familles_gammes WHERE id_image = i.id_image \
                 UNION ALL SELECT nom_gamme FROM gammes WHERE id_image = i.id_image \
                 UNION ALL SELECT nom_domaine FROM domaines_equipements WHERE id_image = i.id_image \
                 UNION ALL SELECT nom_famille FROM familles_equipements WHERE id_image = i.id_image \
               )), '') AS usages \
             FROM images i ORDER BY i.date_creation DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let data: Vec<u8> = row.get(3)?;
            Ok(ImageLibraryItem {
                id_image: row.get(0)?,
                nom: row.get(1)?,
                description: row.get(2)?,
                image_data_base64: BASE64.encode(&data),
                image_mime: row.get(4)?,
                taille_octets: row.get(5)?,
                date_creation: row.get(6)?,
                usages: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_image(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM images WHERE id_image = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("Image introuvable (id={})", id));
    }
    Ok(())
}
