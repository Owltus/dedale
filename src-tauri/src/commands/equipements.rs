use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::equipements::{
    Domaine, DomaineInput, DomaineEquipListItem, Equipement, EquipementInput,
    EquipementListItem, Famille, FamilleEquipListItem, FamilleInput,
};
use crate::models::ordres_travail::OtListItem;

// ════════════════════════════════════════════════════════════════════════════
// ── Domaines techniques (CRUD complet) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère tous les domaines techniques
#[tauri::command]
pub fn get_domaines(db: State<DbPool>) -> Result<Vec<Domaine>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_domaine, nom_domaine, description, id_image \
             FROM domaines_equipements ORDER BY nom_domaine",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Domaine {
                id_domaine: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Crée un domaine technique et retourne l'objet complet
#[tauri::command]
pub fn create_domaine(db: State<DbPool>, input: DomaineInput) -> Result<Domaine, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO domaines_equipements (nom_domaine, description, id_image) VALUES (?1, ?2, ?3)",
        params![input.nom_domaine, input.description, input.id_image],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id_domaine, nom_domaine, description, id_image \
         FROM domaines_equipements WHERE id_domaine = ?1",
        params![id],
        |row| {
            Ok(Domaine {
                id_domaine: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Met à jour un domaine technique et retourne l'objet complet
#[tauri::command]
pub fn update_domaine(
    db: State<DbPool>,
    id: i64,
    input: DomaineInput,
) -> Result<Domaine, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE domaines_equipements SET nom_domaine = ?1, description = ?2, id_image = ?3 \
         WHERE id_domaine = ?4",
        params![input.nom_domaine, input.description, input.id_image, id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_domaine, nom_domaine, description, id_image \
         FROM domaines_equipements WHERE id_domaine = ?1",
        params![id],
        |row| {
            Ok(Domaine {
                id_domaine: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Supprime un domaine technique (RESTRICT empêche la suppression si des familles existent)
#[tauri::command]
pub fn delete_domaine(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM domaines_equipements WHERE id_domaine = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Récupère les domaines équipements avec agrégats pour affichage en cartes
#[tauri::command]
pub fn get_domaines_equip_list(db: State<DbPool>) -> Result<Vec<DomaineEquipListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT d.id_domaine, d.nom_domaine, d.description, d.id_image, \
             (SELECT COUNT(*) FROM familles_equipements f WHERE f.id_domaine = d.id_domaine) AS nb_familles, \
             (SELECT COUNT(*) FROM equipements e JOIN familles_equipements f ON e.id_famille = f.id_famille \
              WHERE f.id_domaine = d.id_domaine AND e.est_actif = 0) AS nb_equipements_inactifs, \
             (SELECT COUNT(*) FROM equipements e JOIN familles_equipements f ON e.id_famille = f.id_famille \
              WHERE f.id_domaine = d.id_domaine) AS nb_equipements_total, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              JOIN familles_equipements f ON e.id_famille = f.id_famille \
              WHERE f.id_domaine = d.id_domaine \
              AND ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5)) AS nb_ot_en_retard, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              JOIN familles_equipements f ON e.id_famille = f.id_famille \
              WHERE f.id_domaine = d.id_domaine AND ot.id_statut_ot = 5) AS nb_ot_reouvert, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              JOIN familles_equipements f ON e.id_famille = f.id_famille \
              WHERE f.id_domaine = d.id_domaine AND ot.id_statut_ot = 2) AS nb_ot_en_cours, \
             (SELECT MIN(ot.date_prevue) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              JOIN familles_equipements f ON e.id_famille = f.id_famille \
              WHERE f.id_domaine = d.id_domaine AND ot.id_statut_ot = 1) AS prochaine_date, \
             (SELECT MIN(p.jours_periodicite) FROM gammes g \
              JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
              JOIN gammes_equipements ge ON g.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              JOIN familles_equipements f ON e.id_famille = f.id_famille \
              WHERE f.id_domaine = d.id_domaine AND g.est_active = 1) AS jours_periodicite_min \
             FROM domaines_equipements d ORDER BY d.nom_domaine",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DomaineEquipListItem {
                id_domaine: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
                nb_familles: row.get(4)?,
                nb_equipements_inactifs: row.get(5)?,
                nb_equipements_total: row.get(6)?,
                nb_ot_en_retard: row.get(7)?,
                nb_ot_reouvert: row.get(8)?,
                nb_ot_en_cours: row.get(9)?,
                prochaine_date: row.get(10)?,
                jours_periodicite_min: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère les familles équipements avec agrégats pour affichage en cartes
#[tauri::command]
pub fn get_familles_equip_list(db: State<DbPool>, id_domaine: i64) -> Result<Vec<FamilleEquipListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT f.id_famille, f.nom_famille, f.description, f.id_image, \
             me.nom_modele, \
             (SELECT COUNT(*) FROM equipements e WHERE e.id_famille = f.id_famille) AS nb_equipements, \
             (SELECT COUNT(*) FROM equipements e WHERE e.id_famille = f.id_famille AND e.est_actif = 0) AS nb_equipements_inactifs, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              WHERE e.id_famille = f.id_famille \
              AND ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5)) AS nb_ot_en_retard, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              WHERE e.id_famille = f.id_famille AND ot.id_statut_ot = 5) AS nb_ot_reouvert, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              WHERE e.id_famille = f.id_famille AND ot.id_statut_ot = 2) AS nb_ot_en_cours, \
             (SELECT MIN(ot.date_prevue) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              WHERE e.id_famille = f.id_famille AND ot.id_statut_ot = 1) AS prochaine_date, \
             (SELECT MIN(p.jours_periodicite) FROM gammes g \
              JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
              JOIN gammes_equipements ge ON g.id_gamme = ge.id_gamme \
              JOIN equipements e ON ge.id_equipement = e.id_equipement \
              WHERE e.id_famille = f.id_famille AND g.est_active = 1) AS jours_periodicite_min \
             FROM familles_equipements f \
             LEFT JOIN modeles_equipements me ON f.id_modele_equipement = me.id_modele_equipement \
             WHERE f.id_domaine = ?1 ORDER BY f.nom_famille",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_domaine], |row| {
            Ok(FamilleEquipListItem {
                id_famille: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
                nom_modele: row.get(4)?,
                nb_equipements: row.get(5)?,
                nb_equipements_inactifs: row.get(6)?,
                nb_ot_en_retard: row.get(7)?,
                nb_ot_reouvert: row.get(8)?,
                nb_ot_en_cours: row.get(9)?,
                prochaine_date: row.get(10)?,
                jours_periodicite_min: row.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère les équipements avec agrégats pour affichage en cartes
#[tauri::command]
pub fn get_equipements_list(db: State<DbPool>, id_famille: i64) -> Result<Vec<EquipementListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT e.id_equipement, e.nom_affichage, e.commentaires, e.est_actif, e.id_image, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              WHERE ge.id_equipement = e.id_equipement \
              AND ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5)) AS nb_ot_en_retard, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              WHERE ge.id_equipement = e.id_equipement AND ot.id_statut_ot = 5) AS nb_ot_reouvert, \
             (SELECT COUNT(*) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              WHERE ge.id_equipement = e.id_equipement AND ot.id_statut_ot = 2) AS nb_ot_en_cours, \
             (SELECT MIN(ot.date_prevue) FROM ordres_travail ot \
              JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme \
              WHERE ge.id_equipement = e.id_equipement AND ot.id_statut_ot = 1) AS prochaine_date, \
             (SELECT MIN(p.jours_periodicite) FROM gammes g \
              JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
              JOIN gammes_equipements ge ON g.id_gamme = ge.id_gamme \
              WHERE ge.id_equipement = e.id_equipement AND g.est_active = 1) AS jours_periodicite_min \
             FROM equipements e WHERE e.id_famille = ?1 ORDER BY e.nom_affichage",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_famille], |row| {
            Ok(EquipementListItem {
                id_equipement: row.get(0)?,
                nom_affichage: row.get(1)?,
                description: row.get(2)?,
                est_actif: row.get(3)?,
                id_image: row.get(4)?,
                nb_ot_en_retard: row.get(5)?,
                nb_ot_reouvert: row.get(6)?,
                nb_ot_en_cours: row.get(7)?,
                prochaine_date: row.get(8)?,
                jours_periodicite_min: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère un domaine technique par son identifiant
#[tauri::command]
pub fn get_domaine(db: State<DbPool>, id: i64) -> Result<Domaine, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_domaine, nom_domaine, description, id_image \
         FROM domaines_equipements WHERE id_domaine = ?1",
        params![id],
        |row| {
            Ok(Domaine {
                id_domaine: row.get(0)?,
                nom_domaine: row.get(1)?,
                description: row.get(2)?,
                id_image: row.get(3)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Familles d'équipements (CRUD complet) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les familles d'équipements, optionnellement filtrées par domaine
#[tauri::command]
pub fn get_familles(
    db: State<DbPool>,
    id_domaine: Option<i64>,
) -> Result<Vec<Famille>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let result = if let Some(domaine_id) = id_domaine {
        // Requête filtrée par domaine
        let mut stmt = conn
            .prepare_cached(
                "SELECT id_famille, nom_famille, description, id_domaine, id_image, id_modele_equipement \
                 FROM familles_equipements WHERE id_domaine = ?1 ORDER BY nom_famille",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![domaine_id], |row| {
                Ok(Famille {
                    id_famille: row.get(0)?,
                    nom_famille: row.get(1)?,
                    description: row.get(2)?,
                    id_domaine: row.get(3)?,
                    id_image: row.get(4)?,
                    id_modele_equipement: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    } else {
        // Toutes les familles
        let mut stmt = conn
            .prepare_cached(
                "SELECT id_famille, nom_famille, description, id_domaine, id_image, id_modele_equipement \
                 FROM familles_equipements ORDER BY nom_famille",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(Famille {
                    id_famille: row.get(0)?,
                    nom_famille: row.get(1)?,
                    description: row.get(2)?,
                    id_domaine: row.get(3)?,
                    id_image: row.get(4)?,
                    id_modele_equipement: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    Ok(result)
}

/// Récupère une famille d'équipements par son identifiant
#[tauri::command]
pub fn get_famille(db: State<DbPool>, id: i64) -> Result<Famille, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_famille, nom_famille, description, id_domaine, id_image, id_modele_equipement \
         FROM familles_equipements WHERE id_famille = ?1",
        params![id],
        |row| {
            Ok(Famille {
                id_famille: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_domaine: row.get(3)?,
                id_image: row.get(4)?,
                id_modele_equipement: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Crée une famille d'équipements et retourne l'objet complet
#[tauri::command]
pub fn create_famille(db: State<DbPool>, input: FamilleInput) -> Result<Famille, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO familles_equipements (nom_famille, description, id_domaine, id_image, id_modele_equipement) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.nom_famille,
            input.description,
            input.id_domaine,
            input.id_image,
            input.id_modele_equipement,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id_famille, nom_famille, description, id_domaine, id_image, id_modele_equipement \
         FROM familles_equipements WHERE id_famille = ?1",
        params![id],
        |row| {
            Ok(Famille {
                id_famille: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_domaine: row.get(3)?,
                id_image: row.get(4)?,
                id_modele_equipement: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Met à jour une famille d'équipements et retourne l'objet complet
#[tauri::command]
pub fn update_famille(
    db: State<DbPool>,
    id: i64,
    input: FamilleInput,
) -> Result<Famille, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE familles_equipements SET nom_famille = ?1, description = ?2, \
         id_domaine = ?3, id_image = ?4, id_modele_equipement = ?5 WHERE id_famille = ?6",
        params![
            input.nom_famille,
            input.description,
            input.id_domaine,
            input.id_image,
            input.id_modele_equipement,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_famille, nom_famille, description, id_domaine, id_image, id_modele_equipement \
         FROM familles_equipements WHERE id_famille = ?1",
        params![id],
        |row| {
            Ok(Famille {
                id_famille: row.get(0)?,
                nom_famille: row.get(1)?,
                description: row.get(2)?,
                id_domaine: row.get(3)?,
                id_image: row.get(4)?,
                id_modele_equipement: row.get(5)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// Supprime une famille d'équipements
#[tauri::command]
pub fn delete_famille(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM familles_equipements WHERE id_famille = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Équipements (CRUD complet) ──
// ════════════════════════════════════════════════════════════════════════════

/// Colonnes SELECT communes pour les équipements
const EQUIPEMENT_COLS: &str =
    "id_equipement, nom_affichage, date_mise_en_service, \
     date_fin_garantie, id_famille, id_local, est_actif, commentaires, id_image, \
     date_creation, date_modification";

/// Construit un Equipement à partir d'une ligne de résultat
fn row_to_equipement(row: &rusqlite::Row) -> rusqlite::Result<Equipement> {
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
}

/// Récupère les équipements, optionnellement filtrés par famille
#[tauri::command]
pub fn get_equipements(
    db: State<DbPool>,
    id_famille: Option<i64>,
) -> Result<Vec<Equipement>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let result = if let Some(famille_id) = id_famille {
        // Requête filtrée par famille
        let sql = format!(
            "SELECT {} FROM equipements WHERE id_famille = ?1 ORDER BY nom_affichage",
            EQUIPEMENT_COLS
        );
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![famille_id], row_to_equipement)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    } else {
        // Tous les équipements
        let sql = format!(
            "SELECT {} FROM equipements ORDER BY nom_affichage",
            EQUIPEMENT_COLS
        );
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], row_to_equipement)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    Ok(result)
}

/// Récupère un équipement par son identifiant
#[tauri::command]
pub fn get_equipement(db: State<DbPool>, id: i64) -> Result<Equipement, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM equipements WHERE id_equipement = ?1",
        EQUIPEMENT_COLS
    );
    conn.query_row(&sql, params![id], row_to_equipement)
        .map_err(|e| e.to_string())
}

/// Crée un équipement et retourne l'objet complet (date_creation et date_modification auto)
#[tauri::command]
pub fn create_equipement(
    db: State<DbPool>,
    input: EquipementInput,
) -> Result<Equipement, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO equipements (nom_affichage, date_mise_en_service, \
         date_fin_garantie, id_famille, id_local, est_actif, commentaires, id_image) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.nom_affichage,
            input.date_mise_en_service,
            input.date_fin_garantie,
            input.id_famille,
            input.id_local,
            input.est_actif,
            input.commentaires,
            input.id_image,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM equipements WHERE id_equipement = ?1",
        EQUIPEMENT_COLS
    );
    conn.query_row(&sql, params![id], row_to_equipement)
        .map_err(|e| e.to_string())
}

/// Met à jour un équipement et retourne l'objet complet (trigger met à jour date_modification)
#[tauri::command]
pub fn update_equipement(
    db: State<DbPool>,
    id: i64,
    input: EquipementInput,
) -> Result<Equipement, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE equipements SET nom_affichage = ?1, date_mise_en_service = ?2, \
         date_fin_garantie = ?3, id_famille = ?4, id_local = ?5, est_actif = ?6, \
         commentaires = ?7, id_image = ?8 WHERE id_equipement = ?9",
        params![
            input.nom_affichage,
            input.date_mise_en_service,
            input.date_fin_garantie,
            input.id_famille,
            input.id_local,
            input.est_actif,
            input.commentaires,
            input.id_image,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM equipements WHERE id_equipement = ?1",
        EQUIPEMENT_COLS
    );
    conn.query_row(&sql, params![id], row_to_equipement)
        .map_err(|e| e.to_string())
}

/// Supprime un équipement
#[tauri::command]
pub fn delete_equipement(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM equipements WHERE id_equipement = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Ordres de travail liés à un équipement (via gammes) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les ordres de travail liés à un équipement (relation via gammes_equipements)
#[tauri::command]
pub fn get_ot_by_equipement(
    db: State<DbPool>,
    id_equipement: i64,
) -> Result<Vec<OtListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    super::helpers::ot_list::query_ot_list(
        &conn,
        "JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme WHERE ge.id_equipement = ?1",
        Some(id_equipement),
    )
}
