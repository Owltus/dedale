use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::referentiels::{
    ModeleDi, ModeleDiDetail, ModeleDiInput, Periodicite, PrioriteOt, StatutDi, StatutOt,
    TypeContrat, TypeDocument, TypeOperation, Unite,
};

// ════════════════════════════════════════════════════════════════════════════
// ── Unités de mesure (CRUD complet) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère toutes les unités de mesure
#[tauri::command]
pub fn get_unites(db: State<DbPool>) -> Result<Vec<Unite>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached("SELECT id_unite, nom, symbole, description FROM unites ORDER BY nom")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Unite {
                id_unite: row.get(0)?,
                nom: row.get(1)?,
                symbole: row.get(2)?,
                description: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Périodicités (lecture seule) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère toutes les périodicités
#[tauri::command]
pub fn get_periodicites(db: State<DbPool>) -> Result<Vec<Periodicite>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_periodicite, libelle, description, jours_periodicite, jours_valide, tolerance_jours \
             FROM periodicites ORDER BY jours_periodicite",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Periodicite {
                id_periodicite: row.get(0)?,
                libelle: row.get(1)?,
                description: row.get(2)?,
                jours_periodicite: row.get(3)?,
                jours_valide: row.get(4)?,
                tolerance_jours: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Types d'opérations (lecture seule) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les types d'opérations
#[tauri::command]
pub fn get_types_operations(db: State<DbPool>) -> Result<Vec<TypeOperation>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_type_operation, libelle, description, necessite_seuils \
             FROM types_operations ORDER BY libelle",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TypeOperation {
                id_type_operation: row.get(0)?,
                libelle: row.get(1)?,
                description: row.get(2)?,
                necessite_seuils: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Types de documents (lecture seule) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les types de documents
#[tauri::command]
pub fn get_types_documents(db: State<DbPool>) -> Result<Vec<TypeDocument>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_type_document, nom, description, est_systeme \
             FROM types_documents ORDER BY nom",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TypeDocument {
                id_type_document: row.get(0)?,
                nom: row.get(1)?,
                description: row.get(2)?,
                est_systeme: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Modèles de DI (CRUD complet) ──
// ════════════════════════════════════════════════════════════════════════════

/// Helper : mapper une row modeles_di vers la struct ModeleDi
fn map_modele_di(row: &rusqlite::Row) -> rusqlite::Result<ModeleDi> {
    Ok(ModeleDi {
        id_modele_di: row.get(0)?,
        nom_modele: row.get(1)?,
        description: row.get(2)?,
        id_famille: row.get(3)?,
        id_equipement: row.get(4)?,
        constat: row.get(5)?,
        date_creation: row.get(6)?,
    })
}

const MODELE_DI_BASE_SQL: &str = "SELECT id_modele_di, nom_modele, description, \
    id_famille, id_equipement, constat, date_creation FROM modeles_di";

/// Récupère tous les modèles de demandes d'intervention
#[tauri::command]
pub fn get_modeles_di(db: State<DbPool>) -> Result<Vec<ModeleDi>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(&format!("{} ORDER BY nom_modele", MODELE_DI_BASE_SQL))
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| map_modele_di(row))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère un modèle de DI par ID avec les libellés associés
#[tauri::command]
pub fn get_modele_di(db: State<DbPool>, id: i64) -> Result<ModeleDiDetail, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT m.id_modele_di, m.nom_modele, m.description, \
         m.id_famille, fe.nom_famille, \
         m.id_equipement, e.nom_affichage, \
         m.constat, m.date_creation \
         FROM modeles_di m \
         LEFT JOIN familles_equipements fe ON fe.id_famille = m.id_famille \
         LEFT JOIN equipements e ON e.id_equipement = m.id_equipement \
         WHERE m.id_modele_di = ?1",
        params![id],
        |row| {
            Ok(ModeleDiDetail {
                id_modele_di: row.get(0)?,
                nom_modele: row.get(1)?,
                description: row.get(2)?,
                id_famille: row.get(3)?,
                nom_famille: row.get(4)?,
                id_equipement: row.get(5)?,
                nom_equipement: row.get(6)?,
                constat: row.get(7)?,
                date_creation: row.get(8)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Crée un modèle de DI et retourne l'objet complet
#[tauri::command]
pub fn create_modele_di(db: State<DbPool>, input: ModeleDiInput) -> Result<ModeleDi, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO modeles_di (nom_modele, description, id_famille, id_equipement, constat) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.nom_modele,
            input.description,
            input.id_famille,
            input.id_equipement,
            input.constat,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        &format!("{} WHERE id_modele_di = ?1", MODELE_DI_BASE_SQL),
        params![id],
        |row| map_modele_di(row),
    )
    .map_err(|e| e.to_string())
}

/// Met à jour un modèle de DI et retourne l'objet complet
#[tauri::command]
pub fn update_modele_di(
    db: State<DbPool>,
    id: i64,
    input: ModeleDiInput,
) -> Result<ModeleDi, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE modeles_di SET nom_modele = ?1, description = ?2, \
         id_famille = ?3, id_equipement = ?4, constat = ?5 WHERE id_modele_di = ?6",
        params![
            input.nom_modele,
            input.description,
            input.id_famille,
            input.id_equipement,
            input.constat,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{} WHERE id_modele_di = ?1", MODELE_DI_BASE_SQL),
        params![id],
        |row| map_modele_di(row),
    )
    .map_err(|e| e.to_string())
}

/// Supprime un modèle de DI
#[tauri::command]
pub fn delete_modele_di(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM modeles_di WHERE id_modele_di = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Types de contrats (lecture seule) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les types de contrats
#[tauri::command]
pub fn get_types_contrats(db: State<DbPool>) -> Result<Vec<TypeContrat>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_type_contrat, libelle, description FROM types_contrats ORDER BY libelle",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TypeContrat {
                id_type_contrat: row.get(0)?,
                libelle: row.get(1)?,
                description: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Statuts et priorités (lecture seule) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les statuts d'ordres de travail
#[tauri::command]
pub fn get_statuts_ot(db: State<DbPool>) -> Result<Vec<StatutOt>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_statut_ot, nom_statut, description FROM statuts_ot ORDER BY id_statut_ot",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StatutOt {
                id_statut_ot: row.get(0)?,
                nom_statut: row.get(1)?,
                description: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère tous les statuts de demandes d'intervention
#[tauri::command]
pub fn get_statuts_di(db: State<DbPool>) -> Result<Vec<StatutDi>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_statut_di, nom_statut, description FROM statuts_di ORDER BY id_statut_di",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(StatutDi {
                id_statut_di: row.get(0)?,
                nom_statut: row.get(1)?,
                description: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère toutes les priorités d'ordres de travail
#[tauri::command]
pub fn get_priorites_ot(db: State<DbPool>) -> Result<Vec<PrioriteOt>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_priorite, nom_priorite, niveau, description \
             FROM priorites_ot ORDER BY niveau",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PrioriteOt {
                id_priorite: row.get(0)?,
                nom_priorite: row.get(1)?,
                niveau: row.get(2)?,
                description: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

