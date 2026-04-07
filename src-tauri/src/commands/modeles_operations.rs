use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::modeles_operations::{ModeleOperation, ModeleOperationInput, ModeleOperationItem, ModeleOperationItemInput};

// ── Colonnes SELECT standard ──

const MODELE_OPERATION_COLS: &str =
    "id_modele_operation, nom_modele, description, id_image, date_creation";

const MODELE_OPERATION_ITEM_COLS: &str =
    "id_modele_operation_item, nom_operation, description, id_type_operation, \
     id_modele_operation, seuil_minimum, seuil_maximum, id_unite";

// ── Helpers de mapping ligne → struct ──

/// Construit un ModeleOperation depuis une ligne rusqlite
fn row_to_modele_operation(row: &rusqlite::Row) -> rusqlite::Result<ModeleOperation> {
    Ok(ModeleOperation {
        id_modele_operation: row.get(0)?,
        nom_modele: row.get(1)?,
        description: row.get(2)?,
        id_image: row.get(3)?,
        date_creation: row.get(4)?,
    })
}

/// Construit un ModeleOperationItem depuis une ligne rusqlite
fn row_to_modele_operation_item(row: &rusqlite::Row) -> rusqlite::Result<ModeleOperationItem> {
    Ok(ModeleOperationItem {
        id_modele_operation_item: row.get(0)?,
        nom_operation: row.get(1)?,
        description: row.get(2)?,
        id_type_operation: row.get(3)?,
        id_modele_operation: row.get(4)?,
        seuil_minimum: row.get(5)?,
        seuil_maximum: row.get(6)?,
        id_unite: row.get(7)?,
    })
}

/// Helper : récupère un ModeleOperation par son id
fn fetch_modele_operation(
    conn: &rusqlite::Connection,
    id: i64,
) -> Result<ModeleOperation, String> {
    conn.query_row(
        &format!(
            "SELECT {} FROM modeles_operations WHERE id_modele_operation = ?1",
            MODELE_OPERATION_COLS
        ),
        params![id],
        |row| row_to_modele_operation(row),
    )
    .map_err(|e| e.to_string())
}

/// Helper : récupère un ModeleOperationItem par son id
fn fetch_modele_operation_item(
    conn: &rusqlite::Connection,
    id: i64,
) -> Result<ModeleOperationItem, String> {
    conn.query_row(
        &format!(
            "SELECT {} FROM modeles_operations_items WHERE id_modele_operation_item = ?1",
            MODELE_OPERATION_ITEM_COLS
        ),
        params![id],
        |row| row_to_modele_operation_item(row),
    )
    .map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Modèles d'opérations (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les modèles d'opérations, triés par nom
#[tauri::command]
pub fn get_modeles_operations(db: State<DbPool>) -> Result<Vec<ModeleOperation>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(&format!(
            "SELECT {} FROM modeles_operations ORDER BY nom_modele",
            MODELE_OPERATION_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row_to_modele_operation(row))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère un modèle d'opération par son identifiant
#[tauri::command]
pub fn get_modele_operation(db: State<DbPool>, id: i64) -> Result<ModeleOperation, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    fetch_modele_operation(&conn, id)
}

/// Crée un modèle d'opération et retourne l'objet complet
#[tauri::command]
pub fn create_modele_operation(
    db: State<DbPool>,
    input: ModeleOperationInput,
) -> Result<ModeleOperation, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO modeles_operations (nom_modele, description, id_image) VALUES (?1, ?2, ?3)",
        params![input.nom_modele, input.description, input.id_image],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    fetch_modele_operation(&conn, id)
}

/// Met à jour un modèle d'opération et retourne l'objet complet
#[tauri::command]
pub fn update_modele_operation(
    db: State<DbPool>,
    id: i64,
    input: ModeleOperationInput,
) -> Result<ModeleOperation, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE modeles_operations SET nom_modele = ?1, description = ?2, id_image = ?3 \
         WHERE id_modele_operation = ?4",
        params![input.nom_modele, input.description, input.id_image, id],
    )
    .map_err(|e| e.to_string())?;
    fetch_modele_operation(&conn, id)
}

/// Supprime un modèle d'opération par son identifiant
#[tauri::command]
pub fn delete_modele_operation(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM modeles_operations WHERE id_modele_operation = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Modèle d'opération Items (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les items d'un modèle d'opération
#[tauri::command]
pub fn get_modele_operation_items(
    db: State<DbPool>,
    id_modele_operation: i64,
) -> Result<Vec<ModeleOperationItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(&format!(
            "SELECT {} FROM modeles_operations_items WHERE id_modele_operation = ?1 \
             ORDER BY id_modele_operation_item",
            MODELE_OPERATION_ITEM_COLS
        ))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_modele_operation], |row| row_to_modele_operation_item(row))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Crée un item de modèle d'opération et retourne l'objet complet
#[tauri::command]
pub fn create_modele_operation_item(
    db: State<DbPool>,
    input: ModeleOperationItemInput,
) -> Result<ModeleOperationItem, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO modeles_operations_items \
         (nom_operation, description, id_type_operation, id_modele_operation, \
          seuil_minimum, seuil_maximum, id_unite) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.nom_operation,
            input.description,
            input.id_type_operation,
            input.id_modele_operation,
            input.seuil_minimum,
            input.seuil_maximum,
            input.id_unite,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    fetch_modele_operation_item(&conn, id)
}

/// Met à jour un item de modèle d'opération et retourne l'objet complet
#[tauri::command]
pub fn update_modele_operation_item(
    db: State<DbPool>,
    id: i64,
    input: ModeleOperationItemInput,
) -> Result<ModeleOperationItem, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE modeles_operations_items SET nom_operation = ?1, description = ?2, \
         id_type_operation = ?3, id_modele_operation = ?4, seuil_minimum = ?5, \
         seuil_maximum = ?6, id_unite = ?7 \
         WHERE id_modele_operation_item = ?8",
        params![
            input.nom_operation,
            input.description,
            input.id_type_operation,
            input.id_modele_operation,
            input.seuil_minimum,
            input.seuil_maximum,
            input.id_unite,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    fetch_modele_operation_item(&conn, id)
}

/// Supprime un item de modèle d'opération par son identifiant
#[tauri::command]
pub fn delete_modele_operation_item(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM modeles_operations_items WHERE id_modele_operation_item = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
