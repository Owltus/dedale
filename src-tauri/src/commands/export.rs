use tauri::State;
use rusqlite::params;
use crate::db::DbPool;
use crate::models::transversaux::OtExportData;

/// Export CSV des ordres de travail
#[tauri::command]
pub fn export_csv_ot(db: State<DbPool>) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare_cached(
        "SELECT id_ordre_travail, nom_gamme, date_prevue, id_statut_ot, \
                id_priorite, nom_prestataire, nom_localisation, est_reglementaire \
         FROM ordres_travail ORDER BY date_prevue DESC"
    ).map_err(|e| e.to_string())?;

    let mut csv = String::from("ID;Gamme;Date prévue;Statut;Priorité;Prestataire;Localisation;Réglementaire\n");
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, i64>(7)?,
        ))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (id, gamme, date, statut, prio, presta, loc, regl) = row.map_err(|e| e.to_string())?;
        csv.push_str(&format!("{};{};{};{};{};{};{};{}\n",
            id, gamme, date, statut, prio,
            presta.unwrap_or_default(), loc.unwrap_or_default(), regl
        ));
    }
    Ok(csv)
}

/// Export CSV des équipements
#[tauri::command]
pub fn export_csv_equipements(db: State<DbPool>) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare_cached(
        "SELECT e.id_equipement, e.nom_affichage, fe.nom_famille, e.est_actif \
         FROM equipements e \
         JOIN familles_equipements fe ON e.id_famille = fe.id_famille \
         ORDER BY e.nom_affichage"
    ).map_err(|e| e.to_string())?;

    let mut csv = String::from("ID;Nom;Famille;Actif\n");
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
        ))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (id, nom, famille, actif) = row.map_err(|e| e.to_string())?;
        csv.push_str(&format!("{};{};{};{}\n",
            id, nom, famille, actif
        ));
    }
    Ok(csv)
}

/// Export CSV des gammes
#[tauri::command]
pub fn export_csv_gammes(db: State<DbPool>) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare_cached(
        "SELECT g.id_gamme, g.nom_gamme, fg.nom_famille, p.libelle, \
                per.libelle, g.est_reglementaire, g.est_active \
         FROM gammes g \
         JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
         JOIN prestataires p ON g.id_prestataire = p.id_prestataire \
         JOIN periodicites per ON g.id_periodicite = per.id_periodicite \
         ORDER BY g.nom_gamme"
    ).map_err(|e| e.to_string())?;

    let mut csv = String::from("ID;Nom;Famille;Prestataire;Périodicité;Réglementaire;Active\n");
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, i64>(6)?,
        ))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (id, nom, famille, presta, perio, regl, active) = row.map_err(|e| e.to_string())?;
        csv.push_str(&format!("{};{};{};{};{};{};{}\n",
            id, nom, famille, presta, perio, regl, active
        ));
    }
    Ok(csv)
}

/// Export données OT pour impression
#[tauri::command]
pub fn get_export_ot(db: State<DbPool>, id: i64) -> Result<OtExportData, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_ordre_travail, nom_gamme, date_prevue, id_statut_ot, \
                nom_prestataire, nom_localisation, nom_famille, nom_technicien, commentaires \
         FROM ordres_travail WHERE id_ordre_travail = ?1",
        params![id],
        |row| Ok(OtExportData {
            id_ordre_travail: row.get(0)?,
            nom_gamme: row.get(1)?,
            date_prevue: row.get(2)?,
            id_statut_ot: row.get(3)?,
            nom_prestataire: row.get(4)?,
            nom_localisation: row.get(5)?,
            nom_famille: row.get(6)?,
            nom_technicien: row.get(7)?,
            commentaires: row.get(8)?,
        }),
    ).map_err(|e| e.to_string())
}
