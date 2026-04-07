use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::prestataires::{Prestataire, PrestataireInput};

/// Colonnes SELECT standard pour la table prestataires
const PRESTATAIRE_COLS: &str = "id_prestataire, libelle, description, adresse, code_postal, ville, telephone, email, id_image";

/// Construit un Prestataire depuis une ligne rusqlite
fn row_to_prestataire(row: &rusqlite::Row) -> rusqlite::Result<Prestataire> {
    Ok(Prestataire {
        id_prestataire: row.get(0)?,
        libelle: row.get(1)?,
        description: row.get(2)?,
        adresse: row.get(3)?,
        code_postal: row.get(4)?,
        ville: row.get(5)?,
        telephone: row.get(6)?,
        email: row.get(7)?,
        id_image: row.get(8)?,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── Prestataires (CRUD complet) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les prestataires, triés par libellé
#[tauri::command]
pub fn get_prestataires(db: State<DbPool>) -> Result<Vec<Prestataire>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(&format!(
            "SELECT {} FROM prestataires ORDER BY libelle",
            PRESTATAIRE_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row_to_prestataire(row))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère un prestataire par son identifiant
#[tauri::command]
pub fn get_prestataire(db: State<DbPool>, id: i64) -> Result<Prestataire, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!(
            "SELECT {} FROM prestataires WHERE id_prestataire = ?1",
            PRESTATAIRE_COLS
        ),
        params![id],
        |row| row_to_prestataire(row),
    )
    .map_err(|e| e.to_string())
}

/// Crée un prestataire et retourne l'objet complet
#[tauri::command]
pub fn create_prestataire(
    db: State<DbPool>,
    input: PrestataireInput,
) -> Result<Prestataire, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO prestataires (libelle, description, adresse, code_postal, ville, telephone, email, id_image) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.libelle,
            input.description,
            input.adresse,
            input.code_postal,
            input.ville,
            input.telephone,
            input.email,
            input.id_image,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!(
            "SELECT {} FROM prestataires WHERE id_prestataire = ?1",
            PRESTATAIRE_COLS
        ),
        params![id],
        |row| row_to_prestataire(row),
    )
    .map_err(|e| e.to_string())
}

/// Met à jour un prestataire et retourne l'objet complet
#[tauri::command]
pub fn update_prestataire(
    db: State<DbPool>,
    id: i64,
    input: PrestataireInput,
) -> Result<Prestataire, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE prestataires SET libelle = ?1, description = ?2, adresse = ?3, \
         code_postal = ?4, ville = ?5, telephone = ?6, email = ?7, id_image = ?8 \
         WHERE id_prestataire = ?9",
        params![
            input.libelle,
            input.description,
            input.adresse,
            input.code_postal,
            input.ville,
            input.telephone,
            input.email,
            input.id_image,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        &format!(
            "SELECT {} FROM prestataires WHERE id_prestataire = ?1",
            PRESTATAIRE_COLS
        ),
        params![id],
        |row| row_to_prestataire(row),
    )
    .map_err(|e| e.to_string())
}

/// Supprime un prestataire par son identifiant
/// Les triggers SQL protègent l'id=1 et les contrats actifs
#[tauri::command]
pub fn delete_prestataire(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM prestataires WHERE id_prestataire = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
