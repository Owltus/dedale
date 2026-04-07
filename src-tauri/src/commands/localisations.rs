use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::equipements::{EquipementListItem, EquipementSelectItem};
use crate::models::gammes::GammeListItem;
use crate::models::localisations::{
    Batiment, BatimentInput, Local, LocalInput, LocalisationFilter, LocalisationTreeNode, Niveau,
    NiveauInput,
};
use crate::models::ordres_travail::OtListItem;

// ════════════════════════════════════════════════════════════════════════════
// ── Constantes et helpers ──
// ════════════════════════════════════════════════════════════════════════════

const BATIMENT_COLS: &str = "b.id_batiment, b.nom, b.description, b.id_image, b.date_creation, b.date_modification, \
    COALESCE((SELECT SUM(l.surface) FROM locaux l JOIN niveaux n ON l.id_niveau = n.id_niveau WHERE n.id_batiment = b.id_batiment), 0)";
const NIVEAU_COLS: &str = "n.id_niveau, n.nom, n.description, n.id_batiment, n.id_image, n.date_creation, n.date_modification, \
    COALESCE((SELECT SUM(l.surface) FROM locaux l WHERE l.id_niveau = n.id_niveau), 0)";
const LOCAL_COLS: &str = "id_local, nom, description, surface, id_niveau, id_image, date_creation, date_modification";

fn row_to_batiment(row: &rusqlite::Row) -> rusqlite::Result<Batiment> {
    Ok(Batiment {
        id_batiment: row.get(0)?,
        nom: row.get(1)?,
        description: row.get(2)?,
        id_image: row.get(3)?,
        date_creation: row.get(4)?,
        date_modification: row.get(5)?,
        surface_totale: row.get(6)?,
    })
}

fn row_to_niveau(row: &rusqlite::Row) -> rusqlite::Result<Niveau> {
    Ok(Niveau {
        id_niveau: row.get(0)?,
        nom: row.get(1)?,
        description: row.get(2)?,
        id_batiment: row.get(3)?,
        id_image: row.get(4)?,
        date_creation: row.get(5)?,
        date_modification: row.get(6)?,
        surface_totale: row.get(7)?,
    })
}

fn row_to_local(row: &rusqlite::Row) -> rusqlite::Result<Local> {
    Ok(Local {
        id_local: row.get(0)?,
        nom: row.get(1)?,
        description: row.get(2)?,
        surface: row.get(3)?,
        id_niveau: row.get(4)?,
        id_image: row.get(5)?,
        date_creation: row.get(6)?,
        date_modification: row.get(7)?,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── Bâtiments (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_batiments(db: State<DbPool>) -> Result<Vec<Batiment>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM batiments b ORDER BY b.nom", BATIMENT_COLS);
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_batiment).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_batiment(db: State<DbPool>, id: i64) -> Result<Batiment, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM batiments b WHERE b.id_batiment = ?1", BATIMENT_COLS);
    conn.query_row(&sql, params![id], row_to_batiment)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_batiment(db: State<DbPool>, input: BatimentInput) -> Result<Batiment, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO batiments (nom, description, id_image) VALUES (?1, ?2, ?3)",
        params![input.nom, input.description, input.id_image],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM batiments b WHERE b.id_batiment = ?1", BATIMENT_COLS);
    conn.query_row(&sql, params![id], row_to_batiment)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_batiment(
    db: State<DbPool>,
    id: i64,
    input: BatimentInput,
) -> Result<Batiment, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE batiments SET nom = ?1, description = ?2, id_image = ?3 WHERE id_batiment = ?4",
        params![input.nom, input.description, input.id_image, id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM batiments b WHERE b.id_batiment = ?1", BATIMENT_COLS);
    conn.query_row(&sql, params![id], row_to_batiment)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_batiment(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM batiments WHERE id_batiment = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Niveaux (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_niveaux(
    db: State<DbPool>,
    id_batiment: Option<i64>,
) -> Result<Vec<Niveau>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    if let Some(bat_id) = id_batiment {
        let sql = format!("SELECT {} FROM niveaux n WHERE n.id_batiment = ?1 ORDER BY n.nom", NIVEAU_COLS);
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![bat_id], row_to_niveau).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    } else {
        let sql = format!("SELECT {} FROM niveaux n ORDER BY n.nom", NIVEAU_COLS);
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], row_to_niveau).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_niveau(db: State<DbPool>, id: i64) -> Result<Niveau, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM niveaux n WHERE n.id_niveau = ?1", NIVEAU_COLS);
    conn.query_row(&sql, params![id], row_to_niveau)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_niveau(db: State<DbPool>, input: NiveauInput) -> Result<Niveau, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO niveaux (nom, description, id_batiment, id_image) VALUES (?1, ?2, ?3, ?4)",
        params![input.nom, input.description, input.id_batiment, input.id_image],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM niveaux n WHERE n.id_niveau = ?1", NIVEAU_COLS);
    conn.query_row(&sql, params![id], row_to_niveau)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_niveau(
    db: State<DbPool>,
    id: i64,
    input: NiveauInput,
) -> Result<Niveau, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE niveaux SET nom = ?1, description = ?2, id_batiment = ?3, id_image = ?4 WHERE id_niveau = ?5",
        params![input.nom, input.description, input.id_batiment, input.id_image, id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM niveaux n WHERE n.id_niveau = ?1", NIVEAU_COLS);
    conn.query_row(&sql, params![id], row_to_niveau)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_niveau(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM niveaux WHERE id_niveau = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Locaux (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_locaux(
    db: State<DbPool>,
    id_niveau: Option<i64>,
) -> Result<Vec<Local>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    if let Some(niv_id) = id_niveau {
        let sql = format!("SELECT {} FROM locaux WHERE id_niveau = ?1 ORDER BY nom", LOCAL_COLS);
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![niv_id], row_to_local).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    } else {
        let sql = format!("SELECT {} FROM locaux ORDER BY nom", LOCAL_COLS);
        let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], row_to_local).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn get_local(db: State<DbPool>, id: i64) -> Result<Local, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM locaux WHERE id_local = ?1", LOCAL_COLS);
    conn.query_row(&sql, params![id], row_to_local)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_local(db: State<DbPool>, input: LocalInput) -> Result<Local, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO locaux (nom, description, surface, id_niveau, id_image) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![input.nom, input.description, input.surface, input.id_niveau, input.id_image],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM locaux WHERE id_local = ?1", LOCAL_COLS);
    conn.query_row(&sql, params![id], row_to_local)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_local(
    db: State<DbPool>,
    id: i64,
    input: LocalInput,
) -> Result<Local, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE locaux SET nom = ?1, description = ?2, surface = ?3, id_niveau = ?4, id_image = ?5 WHERE id_local = ?6",
        params![input.nom, input.description, input.surface, input.id_niveau, input.id_image, id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!("SELECT {} FROM locaux WHERE id_local = ?1", LOCAL_COLS);
    conn.query_row(&sql, params![id], row_to_local)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_local(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM locaux WHERE id_local = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Helper arbre aplati (pour les dropdowns de localisation) ──
// ════════════════════════════════════════════════════════════════════════════

/// Retourne la liste aplatie de tous les locaux avec leur chemin complet
#[tauri::command]
pub fn get_localisations_tree(db: State<DbPool>) -> Result<Vec<LocalisationTreeNode>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT l.id_local, l.nom, n.nom, b.nom \
             FROM locaux l \
             JOIN niveaux n ON l.id_niveau = n.id_niveau \
             JOIN batiments b ON n.id_batiment = b.id_batiment \
             ORDER BY b.nom, n.nom, l.nom",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let nom_local: String = row.get(1)?;
            let nom_niveau: String = row.get(2)?;
            let nom_batiment: String = row.get(3)?;
            let label = format!("{} > {} > {}", nom_batiment, nom_niveau, nom_local);
            Ok(LocalisationTreeNode {
                id_local: row.get(0)?,
                nom_local,
                nom_niveau,
                nom_batiment,
                label,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Données liées à un local (pour la page détail local) ──
// ════════════════════════════════════════════════════════════════════════════

/// Équipements installés dans un local
#[tauri::command]
pub fn get_equipements_by_local(
    db: State<DbPool>,
    id_local: i64,
) -> Result<Vec<EquipementListItem>, String> {
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
             FROM equipements e WHERE e.id_local = ?1 ORDER BY e.nom_affichage",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_local], |row| {
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

/// Équipements d'un local filtrés par famille d'équipement (pour dropdown DI)
#[tauri::command]
pub fn get_equipements_by_local_and_famille(
    db: State<DbPool>,
    id_local: i64,
    id_famille: i64,
) -> Result<Vec<EquipementSelectItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT e.id_equipement, e.nom_affichage \
             FROM equipements e \
             WHERE e.id_local = ?1 AND e.id_famille = ?2 AND e.est_actif = 1 \
             ORDER BY e.nom_affichage",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_local, id_famille], |row| {
            Ok(EquipementSelectItem {
                id_equipement: row.get(0)?,
                nom_affichage: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Locaux, niveaux et bâtiments contenant des équipements actifs d'une famille (filtrage cascade DI)
#[tauri::command]
pub fn get_locaux_ids_by_famille(
    db: State<DbPool>,
    id_famille: i64,
) -> Result<LocalisationFilter, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT DISTINCT l.id_local, l.id_niveau, n.id_batiment \
             FROM equipements e \
             JOIN locaux l ON l.id_local = e.id_local \
             JOIN niveaux n ON n.id_niveau = l.id_niveau \
             WHERE e.id_famille = ?1 AND e.est_actif = 1 AND e.id_local IS NOT NULL",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_famille], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
        })
        .map_err(|e| e.to_string())?;
    let mut locaux = Vec::new();
    let mut niveaux = std::collections::HashSet::new();
    let mut batiments = std::collections::HashSet::new();
    for row in rows {
        let (id_local, id_niveau, id_batiment) = row.map_err(|e| e.to_string())?;
        locaux.push(id_local);
        niveaux.insert(id_niveau);
        batiments.insert(id_batiment);
    }
    Ok(LocalisationFilter {
        locaux,
        niveaux: niveaux.into_iter().collect(),
        batiments: batiments.into_iter().collect(),
    })
}

/// Gammes dont la localisation calculée est ce local
#[tauri::command]
pub fn get_gammes_by_local(
    db: State<DbPool>,
    id_local: i64,
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
             WHERE g.id_local_calc = ?1 \
             ORDER BY g.nom_gamme",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_local], |row| {
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

/// Ordres de travail liés à un local (via gamme.id_local_calc)
#[tauri::command]
pub fn get_ot_by_local(
    db: State<DbPool>,
    id_local: i64,
) -> Result<Vec<OtListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    super::helpers::ot_list::query_ot_list(
        &conn,
        "JOIN gammes g ON ot.id_gamme = g.id_gamme WHERE g.id_local_calc = ?1",
        Some(id_local),
    )
}
