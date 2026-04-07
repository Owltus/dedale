use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::techniciens::{Technicien, TechnicienInput};
use crate::models::ordres_travail::OtListItem;

/// Colonnes SELECT standard pour la table techniciens
const TECHNICIEN_COLS: &str = "id_technicien, nom, prenom, telephone, email, id_poste, est_actif, id_image, date_creation";

/// Construit un Technicien depuis une ligne rusqlite
fn row_to_technicien(row: &rusqlite::Row) -> rusqlite::Result<Technicien> {
    Ok(Technicien {
        id_technicien: row.get(0)?,
        nom: row.get(1)?,
        prenom: row.get(2)?,
        telephone: row.get(3)?,
        email: row.get(4)?,
        id_poste: row.get(5)?,
        est_actif: row.get(6)?,
        id_image: row.get(7)?,
        date_creation: row.get(8)?,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── Techniciens (CRUD complet) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les techniciens, triés par nom puis prénom
#[tauri::command]
pub fn get_techniciens(db: State<DbPool>) -> Result<Vec<Technicien>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(&format!(
            "SELECT {} FROM techniciens ORDER BY nom, prenom",
            TECHNICIEN_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row_to_technicien(row))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère un technicien par son identifiant
#[tauri::command]
pub fn get_technicien(db: State<DbPool>, id: i64) -> Result<Technicien, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!(
            "SELECT {} FROM techniciens WHERE id_technicien = ?1",
            TECHNICIEN_COLS
        ),
        params![id],
        |row| row_to_technicien(row),
    )
    .map_err(|e| e.to_string())
}

/// Crée un technicien et retourne l'objet complet (avec date_creation générée)
#[tauri::command]
pub fn create_technicien(
    db: State<DbPool>,
    input: TechnicienInput,
) -> Result<Technicien, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO techniciens (nom, prenom, telephone, email, id_poste, est_actif, id_image) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.nom,
            input.prenom,
            input.telephone,
            input.email,
            input.id_poste,
            input.est_actif,
            input.id_image,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!(
            "SELECT {} FROM techniciens WHERE id_technicien = ?1",
            TECHNICIEN_COLS
        ),
        params![id],
        |row| row_to_technicien(row),
    )
    .map_err(|e| e.to_string())
}

/// Met à jour un technicien et retourne l'objet complet
#[tauri::command]
pub fn update_technicien(
    db: State<DbPool>,
    id: i64,
    input: TechnicienInput,
) -> Result<Technicien, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE techniciens SET nom = ?1, prenom = ?2, telephone = ?3, \
         email = ?4, id_poste = ?5, est_actif = ?6, id_image = ?7 \
         WHERE id_technicien = ?8",
        params![
            input.nom,
            input.prenom,
            input.telephone,
            input.email,
            input.id_poste,
            input.est_actif,
            input.id_image,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        &format!(
            "SELECT {} FROM techniciens WHERE id_technicien = ?1",
            TECHNICIEN_COLS
        ),
        params![id],
        |row| row_to_technicien(row),
    )
    .map_err(|e| e.to_string())
}

/// Supprime un technicien par son identifiant
#[tauri::command]
pub fn delete_technicien(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM techniciens WHERE id_technicien = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Récupère les ordres de travail assignés à un technicien
#[tauri::command]
pub fn get_ot_by_technicien(
    db: State<DbPool>,
    id_technicien: i64,
) -> Result<Vec<OtListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    super::helpers::ot_list::query_ot_list(&conn, "WHERE ot.id_technicien = ?1", Some(id_technicien))
}
