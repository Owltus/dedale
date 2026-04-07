use tauri::State;
use rusqlite::params;
use crate::db::DbPool;
use crate::models::dashboard::PlanningEvent;

/// Récupère les OT pour un mois donné (vue calendrier mensuelle)
#[tauri::command]
pub fn get_planning_mois(
    db: State<DbPool>,
    annee: i64,
    mois: i64,
) -> Result<Vec<PlanningEvent>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let date_debut = format!("{:04}-{:02}-01", annee, mois);
    let date_fin = if mois == 12 {
        format!("{:04}-01-01", annee + 1)
    } else {
        format!("{:04}-{:02}-01", annee, mois + 1)
    };

    let mut stmt = conn.prepare_cached(
        "SELECT ot.id_ordre_travail, ot.id_gamme, ot.nom_gamme, ot.nom_famille, \
                ot.date_prevue, ot.id_statut_ot, ot.id_priorite, ot.est_reglementaire, \
                ot.nom_prestataire \
         FROM ordres_travail ot \
         WHERE ot.date_prevue >= ?1 AND ot.date_prevue < ?2 \
         ORDER BY ot.date_prevue ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![date_debut, date_fin], |row| {
        Ok(PlanningEvent {
            id_ordre_travail: row.get(0)?,
            id_gamme: row.get(1)?,
            nom_gamme: row.get(2)?,
            nom_famille: row.get(3)?,
            date_prevue: row.get(4)?,
            id_statut_ot: row.get(5)?,
            id_priorite: row.get(6)?,
            est_reglementaire: row.get(7)?,
            nom_prestataire: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère les OT pour une semaine donnée (à partir de la date de début)
#[tauri::command]
pub fn get_planning_semaine(
    db: State<DbPool>,
    date_debut: String,
) -> Result<Vec<PlanningEvent>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare_cached(
        "SELECT ot.id_ordre_travail, ot.id_gamme, ot.nom_gamme, ot.nom_famille, \
                ot.date_prevue, ot.id_statut_ot, ot.id_priorite, ot.est_reglementaire, \
                ot.nom_prestataire \
         FROM ordres_travail ot \
         WHERE ot.date_prevue >= ?1 AND ot.date_prevue < date(?1, '+7 days') \
         ORDER BY ot.date_prevue ASC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![date_debut], |row| {
        Ok(PlanningEvent {
            id_ordre_travail: row.get(0)?,
            id_gamme: row.get(1)?,
            nom_gamme: row.get(2)?,
            nom_famille: row.get(3)?,
            date_prevue: row.get(4)?,
            id_statut_ot: row.get(5)?,
            id_priorite: row.get(6)?,
            est_reglementaire: row.get(7)?,
            nom_prestataire: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère tous les OT d'une année entière (vue Gantt annuel)
#[tauri::command]
pub fn get_planning_annee(
    db: State<DbPool>,
    annee: i64,
) -> Result<Vec<PlanningEvent>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let d1 = format!("{:04}-01-01", annee);
    let d2 = format!("{:04}-01-01", annee + 1);
    let mut stmt = conn.prepare_cached(
        "SELECT ot.id_ordre_travail, ot.id_gamme, ot.nom_gamme, ot.nom_famille, \
                ot.date_prevue, ot.id_statut_ot, ot.id_priorite, ot.est_reglementaire, \
                ot.nom_prestataire \
         FROM ordres_travail ot \
         WHERE ot.date_prevue >= ?1 AND ot.date_prevue < ?2 \
         ORDER BY ot.date_prevue ASC"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![d1, d2], |row| {
        Ok(PlanningEvent {
            id_ordre_travail: row.get(0)?,
            id_gamme: row.get(1)?,
            nom_gamme: row.get(2)?,
            nom_famille: row.get(3)?,
            date_prevue: row.get(4)?,
            id_statut_ot: row.get(5)?,
            id_priorite: row.get(6)?,
            est_reglementaire: row.get(7)?,
            nom_prestataire: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
