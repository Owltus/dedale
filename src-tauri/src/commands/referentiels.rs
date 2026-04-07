use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::referentiels::{
    CategorieErp, Etablissement, EtablissementInput, ModeleDi, ModeleDiDetail, ModeleDiInput,
    Periodicite, Poste, PrioriteOt, StatutDi, StatutOt, TypeContrat,
    TypeDocument, TypeErp, TypeOperation, Unite,
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
// ── Postes (lecture seule) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les postes
#[tauri::command]
pub fn get_postes(db: State<DbPool>) -> Result<Vec<Poste>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached("SELECT id_poste, libelle, description FROM postes ORDER BY libelle")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Poste {
                id_poste: row.get(0)?,
                libelle: row.get(1)?,
                description: row.get(2)?,
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
        libelle_constat: row.get(5)?,
        description_constat: row.get(6)?,
        description_resolution: row.get(7)?,
        date_creation: row.get(8)?,
    })
}

const MODELE_DI_BASE_SQL: &str = "SELECT id_modele_di, nom_modele, description, \
    id_famille, id_equipement, libelle_constat, description_constat, description_resolution, \
    date_creation FROM modeles_di";

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
         m.libelle_constat, m.description_constat, \
         m.description_resolution, m.date_creation \
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
                libelle_constat: row.get(7)?,
                description_constat: row.get(8)?,
                description_resolution: row.get(9)?,
                date_creation: row.get(10)?,
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
        "INSERT INTO modeles_di (nom_modele, description, id_famille, id_equipement, \
         libelle_constat, description_constat, description_resolution) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.nom_modele,
            input.description,
            input.id_famille,
            input.id_equipement,
            input.libelle_constat,
            input.description_constat,
            input.description_resolution
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
         id_famille = ?3, id_equipement = ?4, libelle_constat = ?5, description_constat = ?6, \
         description_resolution = ?7 WHERE id_modele_di = ?8",
        params![
            input.nom_modele,
            input.description,
            input.id_famille,
            input.id_equipement,
            input.libelle_constat,
            input.description_constat,
            input.description_resolution,
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
// ── Types ERP (lecture seule) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les types ERP
#[tauri::command]
pub fn get_types_erp(db: State<DbPool>) -> Result<Vec<TypeErp>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_type_erp, code, libelle, description FROM types_erp ORDER BY code",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TypeErp {
                id_type_erp: row.get(0)?,
                code: row.get(1)?,
                libelle: row.get(2)?,
                description: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère toutes les catégories ERP
#[tauri::command]
pub fn get_categories_erp(db: State<DbPool>) -> Result<Vec<CategorieErp>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_categorie_erp, libelle, description FROM categories_erp ORDER BY libelle",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(CategorieErp {
                id_categorie_erp: row.get(0)?,
                libelle: row.get(1)?,
                description: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
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

// ════════════════════════════════════════════════════════════════════════════
// ── Établissement (fiche unique — upsert) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère l'établissement unique (s'il existe)
#[tauri::command]
pub fn get_etablissement(db: State<DbPool>) -> Result<Option<Etablissement>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id_etablissement, nom, id_type_erp, id_categorie_erp, adresse, code_postal, \
         ville, date_creation, date_modification \
         FROM etablissements LIMIT 1",
        [],
        |row| {
            Ok(Etablissement {
                id_etablissement: row.get(0)?,
                nom: row.get(1)?,
                id_type_erp: row.get(2)?,
                id_categorie_erp: row.get(3)?,
                adresse: row.get(4)?,
                code_postal: row.get(5)?,
                ville: row.get(6)?,
                date_creation: row.get(7)?,
                date_modification: row.get(8)?,
            })
        },
    );
    match result {
        Ok(etab) => Ok(Some(etab)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Crée ou met à jour l'établissement unique
#[tauri::command]
pub fn upsert_etablissement(
    db: State<DbPool>,
    input: EtablissementInput,
) -> Result<Etablissement, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Vérifier si un établissement existe déjà
    let existing_id: Option<i64> = conn
        .query_row(
            "SELECT id_etablissement FROM etablissements LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    let id = match existing_id {
        Some(existing) => {
            // Mise à jour de l'établissement existant
            conn.execute(
                "UPDATE etablissements SET nom = ?1, id_type_erp = ?2, id_categorie_erp = ?3, \
                 adresse = ?4, code_postal = ?5, ville = ?6 WHERE id_etablissement = ?7",
                params![
                    input.nom,
                    input.id_type_erp,
                    input.id_categorie_erp,
                    input.adresse,
                    input.code_postal,
                    input.ville,
                    existing
                ],
            )
            .map_err(|e| e.to_string())?;
            existing
        }
        None => {
            // Création d'un nouvel établissement
            conn.execute(
                "INSERT INTO etablissements (nom, id_type_erp, id_categorie_erp, adresse, \
                 code_postal, ville) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    input.nom,
                    input.id_type_erp,
                    input.id_categorie_erp,
                    input.adresse,
                    input.code_postal,
                    input.ville
                ],
            )
            .map_err(|e| e.to_string())?;
            conn.last_insert_rowid()
        }
    };

    // Re-requêter pour obtenir les champs calculés (date_creation, date_modification)
    conn.query_row(
        "SELECT id_etablissement, nom, id_type_erp, id_categorie_erp, adresse, code_postal, \
         ville, date_creation, date_modification \
         FROM etablissements WHERE id_etablissement = ?1",
        params![id],
        |row| {
            Ok(Etablissement {
                id_etablissement: row.get(0)?,
                nom: row.get(1)?,
                id_type_erp: row.get(2)?,
                id_categorie_erp: row.get(3)?,
                adresse: row.get(4)?,
                code_postal: row.get(5)?,
                ville: row.get(6)?,
                date_creation: row.get(7)?,
                date_modification: row.get(8)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}
