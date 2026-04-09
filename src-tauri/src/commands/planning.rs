use tauri::State;
use rusqlite::params;
use crate::db::DbPool;
use crate::models::dashboard::PlanningEvent;

const PLANNING_SELECT: &str = "\
    SELECT ot.id_ordre_travail, ot.id_gamme, ot.nom_gamme, ot.nom_famille, \
           ot.date_prevue, ot.date_debut, ot.date_cloture, \
           ot.id_statut_ot, ot.id_priorite, ot.est_reglementaire, \
           ot.nom_prestataire, ot.jours_periodicite \
    FROM ordres_travail ot";

const PLANNING_ORDER: &str = "ORDER BY ot.date_prevue ASC";

fn row_to_planning_event(row: &rusqlite::Row) -> rusqlite::Result<PlanningEvent> {
    Ok(PlanningEvent {
        id_ordre_travail: row.get(0)?,
        id_gamme: row.get(1)?,
        nom_gamme: row.get(2)?,
        nom_famille: row.get(3)?,
        date_prevue: row.get(4)?,
        date_debut: row.get(5)?,
        date_cloture: row.get(6)?,
        id_statut_ot: row.get(7)?,
        id_priorite: row.get(8)?,
        est_reglementaire: row.get(9)?,
        nom_prestataire: row.get(10)?,
        jours_periodicite: row.get(11)?,
    })
}

#[tauri::command]
pub fn get_planning_mois(
    db: State<DbPool>,
    annee: i64,
    mois: i64,
) -> Result<Vec<PlanningEvent>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let d1 = format!("{:04}-{:02}-01", annee, mois);
    let d2 = if mois == 12 { format!("{:04}-01-01", annee + 1) } else { format!("{:04}-{:02}-01", annee, mois + 1) };
    let sql = format!("{} WHERE ot.date_prevue >= ?1 AND ot.date_prevue < ?2 {}", PLANNING_SELECT, PLANNING_ORDER);
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![d1, d2], row_to_planning_event).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_planning_semaine(
    db: State<DbPool>,
    date_debut: String,
) -> Result<Vec<PlanningEvent>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("{} WHERE ot.date_prevue >= ?1 AND ot.date_prevue < date(?1, '+7 days') {}", PLANNING_SELECT, PLANNING_ORDER);
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![date_debut], row_to_planning_event).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_planning_annee(
    db: State<DbPool>,
    annee: i64,
) -> Result<Vec<PlanningEvent>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let d1 = format!("{:04}-01-01", annee);
    let d2 = format!("{:04}-01-01", annee + 1);
    let sql = format!("{} WHERE ot.date_prevue >= ?1 AND ot.date_prevue < ?2 {}", PLANNING_SELECT, PLANNING_ORDER);
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params![d1, d2], row_to_planning_event).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
