use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::equipements::Equipement;
use crate::models::gammes::{
    DomaineGamme, DomaineGammeInput, DomaineGammeListItem, FamilleGamme, FamilleGammeInput,
    FamilleGammeListItem, Gamme, GammeInput, GammeListItem, Operation, OperationInput,
};

// ════════════════════════════════════════════════════════════════════════════
// ── Constantes et helpers ──
// ════════════════════════════════════════════════════════════════════════════

/// Colonnes SELECT pour la table gammes (15 colonnes — localisation héritée)
const GAMME_COLS: &str =
    "id_gamme, nom_gamme, description, est_reglementaire, \
     id_periodicite, id_famille_gamme, id_prestataire, id_image, \
     id_batiment_calc, id_niveau_calc, id_local_calc, nom_localisation_calc, \
     date_creation, date_modification, est_active";

/// Colonnes SELECT pour la table operations (8 colonnes)
const OPERATION_COLS: &str =
    "id_operation, nom_operation, description, id_type_operation, id_gamme, \
     seuil_minimum, seuil_maximum, id_unite";

/// Construit une Gamme à partir d'une ligne de résultat
fn row_to_gamme(row: &rusqlite::Row) -> rusqlite::Result<Gamme> {
    Ok(Gamme {
        id_gamme: row.get(0)?,
        nom_gamme: row.get(1)?,
        description: row.get(2)?,
        est_reglementaire: row.get(3)?,
        id_periodicite: row.get(4)?,
        id_famille_gamme: row.get(5)?,
        id_prestataire: row.get(6)?,
        id_image: row.get(7)?,
        id_batiment_calc: row.get(8)?,
        id_niveau_calc: row.get(9)?,
        id_local_calc: row.get(10)?,
        nom_localisation_calc: row.get(11)?,
        date_creation: row.get(12)?,
        date_modification: row.get(13)?,
        est_active: row.get(14)?,
    })
}

/// Construit une Operation à partir d'une ligne de résultat
fn row_to_operation(row: &rusqlite::Row) -> rusqlite::Result<Operation> {
    Ok(Operation {
        id_operation: row.get(0)?,
        nom_operation: row.get(1)?,
        description: row.get(2)?,
        id_type_operation: row.get(3)?,
        id_gamme: row.get(4)?,
        seuil_minimum: row.get(5)?,
        seuil_maximum: row.get(6)?,
        id_unite: row.get(7)?,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── Domaines gammes (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_domaines_gammes(db: State<DbPool>) -> Result<Vec<DomaineGamme>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_domaine_gamme, nom_domaine, description, id_image \
             FROM domaines_gammes ORDER BY nom_domaine",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DomaineGamme {
                id_domaine_gamme: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère les domaines avec agrégats pour affichage en cartes
#[tauri::command]
pub fn get_domaines_gammes_list(db: State<DbPool>) -> Result<Vec<DomaineGammeListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT dg.id_domaine_gamme, dg.nom_domaine, dg.description, dg.id_image, \
             (SELECT COUNT(*) FROM familles_gammes fg WHERE fg.id_domaine_gamme = dg.id_domaine_gamme) AS nb_familles, \
             (SELECT COUNT(*) FROM gammes g \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme AND g.est_active = 0) AS nb_gammes_inactives, \
             (SELECT COUNT(*) FROM gammes g \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme) AS nb_gammes_total, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme \
              AND ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5)) AS nb_ot_en_retard, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme \
              AND ot.id_statut_ot = 5) AS nb_ot_reouvert, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme \
              AND ot.id_statut_ot = 2) AS nb_ot_en_cours, \
             (SELECT COUNT(*) FROM gammes g \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme AND g.est_active = 1 \
              AND NOT EXISTS (SELECT 1 FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme)) AS nb_ot_sans_ot, \
             (SELECT MIN(ot.date_prevue) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme \
              AND ot.id_statut_ot = 1) AS prochaine_date, \
             (SELECT MIN(p.jours_periodicite) FROM gammes g \
              JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
              JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
              WHERE fg.id_domaine_gamme = dg.id_domaine_gamme AND g.est_active = 1) AS jours_periodicite_min \
             FROM domaines_gammes dg \
             ORDER BY dg.nom_domaine",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DomaineGammeListItem {
                id_domaine_gamme: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
                nb_familles: row.get(4)?,
                nb_gammes_inactives: row.get(5)?,
                nb_gammes_total: row.get(6)?,
                nb_ot_en_retard: row.get(7)?,
                nb_ot_reouvert: row.get(8)?,
                nb_ot_en_cours: row.get(9)?,
                nb_ot_sans_ot: row.get(10)?,
                prochaine_date: row.get(11)?,
                jours_periodicite_min: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_domaine_gamme(db: State<DbPool>, id: i64) -> Result<DomaineGamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_domaine_gamme, nom_domaine, description, id_image \
         FROM domaines_gammes WHERE id_domaine_gamme = ?1",
        params![id],
        |row| {
            Ok(DomaineGamme {
                id_domaine_gamme: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_domaine_gamme(
    db: State<DbPool>,
    input: DomaineGammeInput,
) -> Result<DomaineGamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO domaines_gammes (nom_domaine, description, id_image) VALUES (?1, ?2, ?3)",
        params![input.nom_domaine, input.description, input.id_image],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id_domaine_gamme, nom_domaine, description, id_image \
         FROM domaines_gammes WHERE id_domaine_gamme = ?1",
        params![id],
        |row| {
            Ok(DomaineGamme {
                id_domaine_gamme: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_domaine_gamme(
    db: State<DbPool>,
    id: i64,
    input: DomaineGammeInput,
) -> Result<DomaineGamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE domaines_gammes SET nom_domaine = ?1, description = ?2, id_image = ?3 \
         WHERE id_domaine_gamme = ?4",
        params![input.nom_domaine, input.description, input.id_image, id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_domaine_gamme, nom_domaine, description, id_image \
         FROM domaines_gammes WHERE id_domaine_gamme = ?1",
        params![id],
        |row| {
            Ok(DomaineGamme {
                id_domaine_gamme: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_domaine_gamme(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM domaines_gammes WHERE id_domaine_gamme = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Familles gammes (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_familles_gammes(
    db: State<DbPool>,
    id_domaine_gamme: Option<i64>,
) -> Result<Vec<FamilleGamme>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let result = if let Some(domaine_id) = id_domaine_gamme {
        let mut stmt = conn
            .prepare_cached(
                "SELECT id_famille_gamme, nom_famille, description, id_domaine_gamme, id_image \
                 FROM familles_gammes WHERE id_domaine_gamme = ?1 ORDER BY nom_famille",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![domaine_id], |row| {
                Ok(FamilleGamme {
                    id_famille_gamme: row.get(0)?,
                    nom_famille: row.get(1)?,
                    description: row.get(2)?,
                    id_domaine_gamme: row.get(3)?,
                    id_image: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    } else {
        let mut stmt = conn
            .prepare_cached(
                "SELECT id_famille_gamme, nom_famille, description, id_domaine_gamme, id_image \
                 FROM familles_gammes ORDER BY nom_famille",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(FamilleGamme {
                    id_famille_gamme: row.get(0)?,
                    nom_famille: row.get(1)?,
                    description: row.get(2)?,
                    id_domaine_gamme: row.get(3)?,
                    id_image: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    Ok(result)
}

/// Récupère les familles avec agrégats pour affichage en cartes
#[tauri::command]
pub fn get_familles_gammes_list(
    db: State<DbPool>,
    id_domaine_gamme: i64,
) -> Result<Vec<FamilleGammeListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT fg.id_famille_gamme, fg.nom_famille, fg.description, fg.id_image, \
             (SELECT COUNT(*) FROM gammes g WHERE g.id_famille_gamme = fg.id_famille_gamme) AS nb_gammes, \
             (SELECT COUNT(*) FROM gammes g WHERE g.id_famille_gamme = fg.id_famille_gamme \
              AND g.est_active = 0) AS nb_gammes_inactives, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              WHERE g.id_famille_gamme = fg.id_famille_gamme \
              AND ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5)) AS nb_ot_en_retard, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              WHERE g.id_famille_gamme = fg.id_famille_gamme \
              AND ot.id_statut_ot = 5) AS nb_ot_reouvert, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              WHERE g.id_famille_gamme = fg.id_famille_gamme \
              AND ot.id_statut_ot = 2) AS nb_ot_en_cours, \
             (SELECT COUNT(*) FROM gammes g WHERE g.id_famille_gamme = fg.id_famille_gamme \
              AND g.est_active = 1 \
              AND NOT EXISTS (SELECT 1 FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme)) AS nb_ot_sans_ot, \
             (SELECT MIN(ot.date_prevue) FROM ordres_travail ot \
              JOIN gammes g ON ot.id_gamme = g.id_gamme \
              WHERE g.id_famille_gamme = fg.id_famille_gamme \
              AND ot.id_statut_ot = 1) AS prochaine_date, \
             (SELECT MIN(p.jours_periodicite) FROM gammes g \
              JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
              WHERE g.id_famille_gamme = fg.id_famille_gamme \
              AND g.est_active = 1) AS jours_periodicite_min \
             FROM familles_gammes fg \
             WHERE fg.id_domaine_gamme = ?1 \
             ORDER BY fg.nom_famille",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_domaine_gamme], |row| {
            Ok(FamilleGammeListItem {
                id_famille_gamme: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
                nb_gammes: row.get(4)?,
                nb_gammes_inactives: row.get(5)?,
                nb_ot_en_retard: row.get(6)?,
                nb_ot_reouvert: row.get(7)?,
                nb_ot_en_cours: row.get(8)?,
                nb_ot_sans_ot: row.get(9)?,
                prochaine_date: row.get(10)?,
                jours_periodicite_min: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_famille_gamme(db: State<DbPool>, id: i64) -> Result<FamilleGamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_famille_gamme, nom_famille, description, id_domaine_gamme, id_image \
         FROM familles_gammes WHERE id_famille_gamme = ?1",
        params![id],
        |row| {
            Ok(FamilleGamme {
                id_famille_gamme: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_domaine_gamme: row.get(3)?,
                id_image: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_famille_gamme(
    db: State<DbPool>,
    input: FamilleGammeInput,
) -> Result<FamilleGamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO familles_gammes (nom_famille, description, id_domaine_gamme, id_image) \
         VALUES (?1, ?2, ?3, ?4)",
        params![
            input.nom_famille,
            input.description,
            input.id_domaine_gamme,
            input.id_image
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id_famille_gamme, nom_famille, description, id_domaine_gamme, id_image \
         FROM familles_gammes WHERE id_famille_gamme = ?1",
        params![id],
        |row| {
            Ok(FamilleGamme {
                id_famille_gamme: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_domaine_gamme: row.get(3)?,
                id_image: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_famille_gamme(
    db: State<DbPool>,
    id: i64,
    input: FamilleGammeInput,
) -> Result<FamilleGamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE familles_gammes SET nom_famille = ?1, description = ?2, \
         id_domaine_gamme = ?3, id_image = ?4 WHERE id_famille_gamme = ?5",
        params![
            input.nom_famille,
            input.description,
            input.id_domaine_gamme,
            input.id_image,
            id
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_famille_gamme, nom_famille, description, id_domaine_gamme, id_image \
         FROM familles_gammes WHERE id_famille_gamme = ?1",
        params![id],
        |row| {
            Ok(FamilleGamme {
                id_famille_gamme: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_domaine_gamme: row.get(3)?,
                id_image: row.get(4)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_famille_gamme(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM familles_gammes WHERE id_famille_gamme = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Gammes CRUD ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère la liste des gammes avec noms résolus, optionnellement filtrées par famille gamme
#[tauri::command]
pub fn get_gammes(
    db: State<DbPool>,
    id_famille_gamme: Option<i64>,
) -> Result<Vec<GammeListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let base_sql = "SELECT g.id_gamme, g.nom_gamme, g.est_reglementaire, g.est_active, \
             fg.nom_famille, p.libelle AS libelle_periodicite, \
             pr.libelle AS nom_prestataire, g.description, g.id_image, \
             (SELECT COUNT(*) FROM documents_gammes dg WHERE dg.id_gamme = g.id_gamme) AS nb_documents, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme) AS nb_ot_total, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5)) AS nb_ot_en_retard, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.id_statut_ot = 5) AS nb_ot_reouvert, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.id_statut_ot = 2) AS nb_ot_en_cours, \
             (SELECT MIN(ot.date_prevue) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.id_statut_ot = 1) AS prochaine_date, \
             p.jours_periodicite \
             FROM gammes g \
             JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
             JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
             JOIN prestataires pr ON g.id_prestataire = pr.id_prestataire";

    let row_mapper = |row: &rusqlite::Row| -> rusqlite::Result<GammeListItem> {
        Ok(GammeListItem {
            id_gamme: row.get(0)?,
            nom_gamme: row.get(1)?,
            est_reglementaire: row.get(2)?,
            est_active: row.get(3)?,
            nom_famille: row.get(4)?,
            libelle_periodicite: row.get(5)?,
            nom_prestataire: row.get(6)?,
            description: row.get(7)?,
            id_image: row.get(8)?,
            nb_documents: row.get(9)?,
            nb_ot_total: row.get(10)?,
            nb_ot_en_retard: row.get(11)?,
            nb_ot_reouvert: row.get(12)?,
            nb_ot_en_cours: row.get(13)?,
            prochaine_date: row.get(14)?,
            jours_periodicite: row.get(15)?,
        })
    };

    let result = if let Some(famille_id) = id_famille_gamme {
        let sql = format!(
            "{} WHERE g.id_famille_gamme = ?1 ORDER BY g.nom_gamme",
            base_sql
        );
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![famille_id], row_mapper)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    } else {
        let sql = format!("{} ORDER BY g.nom_gamme", base_sql);
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], row_mapper)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    Ok(result)
}

/// Récupère une gamme complète par son identifiant (12 colonnes)
#[tauri::command]
pub fn get_gamme(db: State<DbPool>, id: i64) -> Result<Gamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM gammes WHERE id_gamme = ?1",
        GAMME_COLS
    );
    conn.query_row(&sql, params![id], row_to_gamme)
        .map_err(|e| e.to_string())
}

/// Crée une gamme et retourne l'objet complet (date_creation et date_modification auto)
#[tauri::command]
pub fn create_gamme(db: State<DbPool>, input: GammeInput) -> Result<Gamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO gammes (nom_gamme, description, est_reglementaire, \
         id_periodicite, id_famille_gamme, id_prestataire, id_image) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.nom_gamme,
            input.description,
            input.est_reglementaire,
            input.id_periodicite,
            input.id_famille_gamme,
            input.id_prestataire,
            input.id_image,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM gammes WHERE id_gamme = ?1",
        GAMME_COLS
    );
    conn.query_row(&sql, params![id], row_to_gamme)
        .map_err(|e| e.to_string())
}

/// Met à jour une gamme et retourne l'objet complet
/// Le trigger a_propagation_gamme_vers_ot propage les modifications aux OT actifs
#[tauri::command]
pub fn update_gamme(
    db: State<DbPool>,
    id: i64,
    input: GammeInput,
) -> Result<Gamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE gammes SET nom_gamme = ?1, description = ?2, est_reglementaire = ?3, \
         id_periodicite = ?4, id_famille_gamme = ?5, \
         id_prestataire = ?6, id_image = ?7 \
         WHERE id_gamme = ?8",
        params![
            input.nom_gamme,
            input.description,
            input.est_reglementaire,
            input.id_periodicite,
            input.id_famille_gamme,
            input.id_prestataire,
            input.id_image,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM gammes WHERE id_gamme = ?1",
        GAMME_COLS
    );
    conn.query_row(&sql, params![id], row_to_gamme)
        .map_err(|e| e.to_string())
}

/// Supprime une gamme (CASCADE supprime les opérations et gamme_modeles liés)
#[tauri::command]
pub fn delete_gamme(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM gammes WHERE id_gamme = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Active ou désactive une gamme et retourne l'objet complet
/// Le trigger protège la désactivation si des OT actifs existent
#[tauri::command]
pub fn toggle_gamme_active(
    db: State<DbPool>,
    id: i64,
    est_active: i64,
) -> Result<Gamme, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE gammes SET est_active = ?1 WHERE id_gamme = ?2",
        params![est_active, id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM gammes WHERE id_gamme = ?1",
        GAMME_COLS
    );
    conn.query_row(&sql, params![id], row_to_gamme)
        .map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Opérations CRUD ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les opérations d'une gamme, triées par identifiant
#[tauri::command]
pub fn get_operations(db: State<DbPool>, id_gamme: i64) -> Result<Vec<Operation>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM operations WHERE id_gamme = ?1 ORDER BY id_operation",
        OPERATION_COLS
    );
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_gamme], row_to_operation)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Crée une opération et retourne l'objet complet
/// Le trigger f_ajout_operation_specifique_vers_ot injecte l'opération dans les OT actifs
#[tauri::command]
pub fn create_operation(
    db: State<DbPool>,
    input: OperationInput,
) -> Result<Operation, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO operations (nom_operation, description, id_type_operation, id_gamme, \
         seuil_minimum, seuil_maximum, id_unite) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.nom_operation,
            input.description,
            input.id_type_operation,
            input.id_gamme,
            input.seuil_minimum,
            input.seuil_maximum,
            input.id_unite,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM operations WHERE id_operation = ?1",
        OPERATION_COLS
    );
    conn.query_row(&sql, params![id], row_to_operation)
        .map_err(|e| e.to_string())
}

/// Met à jour une opération et retourne l'objet complet
/// Le trigger propage les modifications aux OT actifs
#[tauri::command]
pub fn update_operation(
    db: State<DbPool>,
    id: i64,
    input: OperationInput,
) -> Result<Operation, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE operations SET nom_operation = ?1, description = ?2, \
         id_type_operation = ?3, id_gamme = ?4, seuil_minimum = ?5, \
         seuil_maximum = ?6, id_unite = ?7 \
         WHERE id_operation = ?8",
        params![
            input.nom_operation,
            input.description,
            input.id_type_operation,
            input.id_gamme,
            input.seuil_minimum,
            input.seuil_maximum,
            input.id_unite,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM operations WHERE id_operation = ?1",
        OPERATION_COLS
    );
    conn.query_row(&sql, params![id], row_to_operation)
        .map_err(|e| e.to_string())
}

/// Supprime une opération (le trigger nettoie les OT associés)
#[tauri::command]
pub fn delete_operation(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM operations WHERE id_operation = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Gamme-Modèles (liaison gamme ↔ modèle d'opération) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les identifiants modèle d'opération liés à une gamme
#[tauri::command]
pub fn get_gamme_modeles(db: State<DbPool>, id_gamme: i64) -> Result<Vec<i64>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_modele_operation FROM gamme_modeles WHERE id_gamme = ?1 ORDER BY id_modele_operation",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_gamme], |row| row.get::<_, i64>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Lie un modèle d'opération à une gamme (INSERT dans gamme_modeles)
/// Le trigger e_ajout_gamme_type_vers_ot_existants injecte les opérations modèles dans les OT actifs
#[tauri::command]
pub fn link_modele_operation(
    db: State<DbPool>,
    id_gamme: i64,
    id_modele_operation: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO gamme_modeles (id_gamme, id_modele_operation) VALUES (?1, ?2)",
        params![id_gamme, id_modele_operation],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Délie un modèle d'opération d'une gamme (DELETE dans gamme_modeles)
/// Le trigger synchronisation_suppression_gamme_modeles nettoie les OT associés
#[tauri::command]
pub fn unlink_modele_operation(
    db: State<DbPool>,
    id_gamme: i64,
    id_modele_operation: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM gamme_modeles WHERE id_gamme = ?1 AND id_modele_operation = ?2",
        params![id_gamme, id_modele_operation],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Liaison gammes ↔ équipements (N↔N) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les équipements liés à une gamme
#[tauri::command]
pub fn get_gamme_equipements(
    db: State<DbPool>,
    id_gamme: i64,
) -> Result<Vec<Equipement>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT e.id_equipement, e.nom_affichage, \
             e.date_mise_en_service, e.date_fin_garantie, e.id_famille, e.id_local, \
             e.est_actif, e.commentaires, e.id_image, e.date_creation, e.date_modification \
             FROM equipements e \
             JOIN gammes_equipements ge ON e.id_equipement = ge.id_equipement \
             WHERE ge.id_gamme = ?1 \
             ORDER BY e.nom_affichage",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_gamme], |row| {
            Ok(Equipement {
                id_equipement: row.get(0)?,
                nom_affichage: row.get(1)?,
                date_mise_en_service: row.get(2)?,
                date_fin_garantie: row.get(3)?,
                id_famille: row.get(4)?,
                id_local: row.get(5)?,
                est_actif: row.get(6)?,
                commentaires: row.get(7)?,
                id_image: row.get(8)?,
                date_creation: row.get(9)?,
                date_modification: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Lie un équipement à une gamme
#[tauri::command]
pub fn link_gamme_equipement(
    db: State<DbPool>,
    id_gamme: i64,
    id_equipement: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES (?1, ?2)",
        params![id_gamme, id_equipement],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Lie plusieurs équipements à une gamme en une seule transaction
#[tauri::command]
pub fn link_gamme_equipements_batch(
    db: State<DbPool>,
    id_gamme: i64,
    id_equipements: Vec<i64>,
) -> Result<(), String> {
    let mut conn = db.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id_eq in &id_equipements {
        tx.execute(
            "INSERT OR IGNORE INTO gammes_equipements (id_gamme, id_equipement) VALUES (?1, ?2)",
            params![id_gamme, id_eq],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Délie un équipement d'une gamme
#[tauri::command]
pub fn unlink_gamme_equipement(
    db: State<DbPool>,
    id_gamme: i64,
    id_equipement: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM gammes_equipements WHERE id_gamme = ?1 AND id_equipement = ?2",
        params![id_gamme, id_equipement],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Récupère les gammes liées à un équipement (pour la page détail équipement)
#[tauri::command]
pub fn get_equipement_gammes(
    db: State<DbPool>,
    id_equipement: i64,
) -> Result<Vec<GammeListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT g.id_gamme, g.nom_gamme, g.est_reglementaire, g.est_active, \
             fg.nom_famille, p.libelle AS libelle_periodicite, \
             pr.libelle AS nom_prestataire, g.description, g.id_image, \
             (SELECT COUNT(*) FROM documents_gammes dg WHERE dg.id_gamme = g.id_gamme) AS nb_documents, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme) AS nb_ot_total, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5)) AS nb_ot_en_retard, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.id_statut_ot = 5) AS nb_ot_reouvert, \
             (SELECT COUNT(*) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.id_statut_ot = 2) AS nb_ot_en_cours, \
             (SELECT MIN(ot.date_prevue) FROM ordres_travail ot WHERE ot.id_gamme = g.id_gamme \
              AND ot.id_statut_ot = 1) AS prochaine_date, \
             p.jours_periodicite \
             FROM gammes g \
             JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
             JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
             JOIN prestataires pr ON g.id_prestataire = pr.id_prestataire \
             JOIN gammes_equipements ge ON g.id_gamme = ge.id_gamme \
             WHERE ge.id_equipement = ?1 \
             ORDER BY g.nom_gamme",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_equipement], |row| {
            Ok(GammeListItem {
                id_gamme: row.get(0)?,
                nom_gamme: row.get(1)?,
                est_reglementaire: row.get(2)?,
                est_active: row.get(3)?,
                nom_famille: row.get(4)?,
                libelle_periodicite: row.get(5)?,
                nom_prestataire: row.get(6)?,
                description: row.get(7)?,
                id_image: row.get(8)?,
                nb_documents: row.get(9)?,
                nb_ot_total: row.get(10)?,
                nb_ot_en_retard: row.get(11)?,
                nb_ot_reouvert: row.get(12)?,
                nb_ot_en_cours: row.get(13)?,
                prochaine_date: row.get(14)?,
                jours_periodicite: row.get(15)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
