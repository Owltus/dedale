use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::contrats::{
    AvenantInput, Contrat, ContratInput, ContratListItem, ContratVersion, ResiliationInput,
};

// ════════════════════════════════════════════════════════════════════════════
// ── Colonnes et helpers ──
// ════════════════════════════════════════════════════════════════════════════

/// Colonnes SELECT complètes pour un contrat
const CONTRAT_COLS: &str =
    "id_contrat, id_prestataire, id_type_contrat, id_contrat_parent, est_archive, \
     objet_avenant, reference, date_signature, date_debut, date_fin, date_resiliation, \
     date_notification, duree_cycle_mois, delai_preavis_jours, fenetre_resiliation_jours, \
     commentaires, date_creation, date_modification";

/// Calcule le statut d'un contrat à partir de ses champs
/// Le statut n'est pas stocké en base — il est dérivé dynamiquement
fn calculer_statut_contrat(
    est_archive: i64,
    date_resiliation: &Option<String>,
    date_debut: &str,
    date_fin: &Option<String>,
) -> String {
    if est_archive == 1 {
        return "Archivé".to_string();
    }
    if date_resiliation.is_some() {
        return "Résilié".to_string();
    }
    // Comparer avec la date du jour (format YYYY-MM-DD)
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    if date_debut > today.as_str() {
        return "À venir".to_string();
    }
    if let Some(fin) = date_fin {
        if fin.as_str() < today.as_str() {
            return "Expiré".to_string();
        }
    }
    "Actif".to_string()
}

/// Construit un Contrat complet à partir d'une ligne de résultat (18 colonnes + statut calculé)
fn row_to_contrat(row: &rusqlite::Row) -> rusqlite::Result<Contrat> {
    let est_archive: i64 = row.get(4)?;
    let date_resiliation: Option<String> = row.get(10)?;
    let date_debut: String = row.get(8)?;
    let date_fin: Option<String> = row.get(9)?;

    let statut = calculer_statut_contrat(est_archive, &date_resiliation, &date_debut, &date_fin);

    Ok(Contrat {
        id_contrat: row.get(0)?,
        id_prestataire: row.get(1)?,
        id_type_contrat: row.get(2)?,
        id_contrat_parent: row.get(3)?,
        est_archive,
        objet_avenant: row.get(5)?,
        reference: row.get(6)?,
        date_signature: row.get(7)?,
        date_debut,
        date_fin,
        date_resiliation,
        date_notification: row.get(11)?,
        duree_cycle_mois: row.get(12)?,
        delai_preavis_jours: row.get(13)?,
        fenetre_resiliation_jours: row.get(14)?,
        commentaires: row.get(15)?,
        date_creation: row.get(16)?,
        date_modification: row.get(17)?,
        statut,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── CRUD Contrats ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère la liste de tous les contrats avec nom prestataire et type
#[tauri::command]
pub fn get_contrats(db: State<DbPool>) -> Result<Vec<ContratListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT c.id_contrat, c.id_prestataire, p.libelle AS nom_prestataire, \
             c.id_type_contrat, tc.libelle AS libelle_type, c.est_archive, \
             c.reference, c.date_debut, c.date_fin, c.date_resiliation, \
             c.date_signature, c.duree_cycle_mois, c.delai_preavis_jours, \
             c.fenetre_resiliation_jours, c.commentaires, c.objet_avenant, \
             c.date_notification, \
             (SELECT COUNT(*) FROM contrats a WHERE a.id_contrat_parent = c.id_contrat) AS nb_avenants \
             FROM contrats c \
             JOIN prestataires p ON c.id_prestataire = p.id_prestataire \
             JOIN types_contrats tc ON c.id_type_contrat = tc.id_type_contrat \
             ORDER BY c.date_debut DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let est_archive: i64 = row.get(5)?;
            let date_debut: String = row.get(7)?;
            let date_fin: Option<String> = row.get(8)?;
            let date_resiliation: Option<String> = row.get(9)?;

            let statut = calculer_statut_contrat(
                est_archive,
                &date_resiliation,
                &date_debut,
                &date_fin,
            );

            Ok(ContratListItem {
                id_contrat: row.get(0)?,
                id_prestataire: row.get(1)?,
                nom_prestataire: row.get(2)?,
                id_type_contrat: row.get(3)?,
                libelle_type: row.get(4)?,
                est_archive,
                reference: row.get(6)?,
                date_debut,
                date_fin,
                date_resiliation,
                date_signature: row.get(10)?,
                duree_cycle_mois: row.get(11)?,
                delai_preavis_jours: row.get(12)?,
                fenetre_resiliation_jours: row.get(13)?,
                commentaires: row.get(14)?,
                objet_avenant: row.get(15)?,
                date_notification: row.get(16)?,
                nb_avenants: row.get(17)?,
                statut,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère un contrat complet par son identifiant
#[tauri::command]
pub fn get_contrat(db: State<DbPool>, id: i64) -> Result<Contrat, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM contrats WHERE id_contrat = ?1",
        CONTRAT_COLS
    );
    conn.query_row(&sql, params![id], row_to_contrat)
        .map_err(|e| e.to_string())
}

/// Crée un contrat et retourne l'objet complet (date_creation auto via trigger)
#[tauri::command]
pub fn create_contrat(db: State<DbPool>, input: ContratInput) -> Result<Contrat, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO contrats (id_prestataire, id_type_contrat, reference, date_signature, \
         date_debut, date_fin, duree_cycle_mois, delai_preavis_jours, \
         fenetre_resiliation_jours, commentaires) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            input.id_prestataire,
            input.id_type_contrat,
            input.reference,
            input.date_signature,
            input.date_debut,
            input.date_fin,
            input.duree_cycle_mois,
            input.delai_preavis_jours,
            input.fenetre_resiliation_jours,
            input.commentaires,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM contrats WHERE id_contrat = ?1",
        CONTRAT_COLS
    );
    conn.query_row(&sql, params![id], row_to_contrat)
        .map_err(|e| e.to_string())
}

/// Met à jour un contrat et retourne l'objet complet (trigger protège les archivés)
#[tauri::command]
pub fn update_contrat(
    db: State<DbPool>,
    id: i64,
    input: ContratInput,
) -> Result<Contrat, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE contrats SET id_prestataire = ?1, id_type_contrat = ?2, \
         reference = ?3, date_signature = ?4, date_debut = ?5, date_fin = ?6, \
         duree_cycle_mois = ?7, delai_preavis_jours = ?8, \
         fenetre_resiliation_jours = ?9, commentaires = ?10 \
         WHERE id_contrat = ?11",
        params![
            input.id_prestataire,
            input.id_type_contrat,
            input.reference,
            input.date_signature,
            input.date_debut,
            input.date_fin,
            input.duree_cycle_mois,
            input.delai_preavis_jours,
            input.fenetre_resiliation_jours,
            input.commentaires,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM contrats WHERE id_contrat = ?1",
        CONTRAT_COLS
    );
    conn.query_row(&sql, params![id], row_to_contrat)
        .map_err(|e| e.to_string())
}

/// Supprime un contrat (RESTRICT empêche si des avenants existent)
#[tauri::command]
pub fn delete_contrat(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM contrats WHERE id_contrat = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Résiliation ──
// ════════════════════════════════════════════════════════════════════════════

/// Résilie un contrat en renseignant les dates de notification et résiliation
#[tauri::command]
pub fn resilier_contrat(
    db: State<DbPool>,
    id: i64,
    input: ResiliationInput,
) -> Result<Contrat, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE contrats SET date_notification = ?1, date_resiliation = ?2 \
         WHERE id_contrat = ?3",
        params![input.date_notification, input.date_resiliation, id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM contrats WHERE id_contrat = ?1",
        CONTRAT_COLS
    );
    conn.query_row(&sql, params![id], row_to_contrat)
        .map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Avenants ──
// ════════════════════════════════════════════════════════════════════════════

/// Crée un avenant (contrat enfant). Le trigger auto-archive le contrat parent.
#[tauri::command]
pub fn create_avenant(db: State<DbPool>, input: AvenantInput) -> Result<Contrat, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO contrats (id_contrat_parent, objet_avenant, id_prestataire, \
         id_type_contrat, reference, date_signature, date_debut, date_fin, duree_cycle_mois, \
         delai_preavis_jours, fenetre_resiliation_jours, commentaires) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            input.id_contrat_parent,
            input.objet_avenant,
            input.id_prestataire,
            input.id_type_contrat,
            input.reference,
            input.date_signature,
            input.date_debut,
            input.date_fin,
            input.duree_cycle_mois,
            input.delai_preavis_jours,
            input.fenetre_resiliation_jours,
            input.commentaires,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM contrats WHERE id_contrat = ?1",
        CONTRAT_COLS
    );
    conn.query_row(&sql, params![id], row_to_contrat)
        .map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Versions (chaîne d'avenants) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère la chaîne de versions d'un contrat (racine + tous les avenants)
/// Remonte d'abord à la racine via id_contrat_parent, puis collecte tous les descendants
#[tauri::command]
pub fn get_contrat_versions(db: State<DbPool>, id: i64) -> Result<Vec<ContratVersion>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Étape 1 : remonter à la racine de la chaîne
    let mut root_id = id;
    loop {
        let parent: Option<i64> = conn
            .query_row(
                "SELECT id_contrat_parent FROM contrats WHERE id_contrat = ?1",
                params![root_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        match parent {
            Some(pid) => root_id = pid,
            None => break,
        }
    }

    // Étape 2 : récupérer toute la chaîne via CTE récursif
    let mut stmt = conn
        .prepare_cached(
            "WITH RECURSIVE chain(id_contrat) AS ( \
                 SELECT ?1 \
                 UNION ALL \
                 SELECT c.id_contrat FROM contrats c \
                 JOIN chain ch ON c.id_contrat_parent = ch.id_contrat \
             ) \
             SELECT c.id_contrat, c.id_contrat_parent, c.est_archive, \
                    c.objet_avenant, c.reference, c.date_debut, c.date_fin, c.date_creation, \
                    c.date_resiliation \
             FROM contrats c \
             JOIN chain ch ON c.id_contrat = ch.id_contrat \
             ORDER BY c.date_debut ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![root_id], |row| {
            let est_archive: i64 = row.get(2)?;
            let date_debut: String = row.get(5)?;
            let date_fin: Option<String> = row.get(6)?;
            let date_resiliation: Option<String> = row.get(8)?;
            let statut = calculer_statut_contrat(est_archive, &date_resiliation, &date_debut, &date_fin);

            Ok(ContratVersion {
                id_contrat: row.get(0)?,
                id_contrat_parent: row.get(1)?,
                est_archive,
                objet_avenant: row.get(3)?,
                reference: row.get(4)?,
                date_debut,
                date_fin,
                date_creation: row.get(7)?,
                statut,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Liaison contrats ↔ gammes ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les identifiants de gammes liées à un contrat
#[tauri::command]
pub fn get_contrat_gammes(db: State<DbPool>, id_contrat: i64) -> Result<Vec<i64>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_gamme FROM contrats_gammes WHERE id_contrat = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_contrat], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Lie une gamme à un contrat (UNIQUE constraint empêche les doublons)
#[tauri::command]
pub fn link_contrat_gamme(
    db: State<DbPool>,
    id_contrat: i64,
    id_gamme: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO contrats_gammes (id_contrat, id_gamme) VALUES (?1, ?2)",
        params![id_contrat, id_gamme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime la liaison entre un contrat et une gamme
#[tauri::command]
pub fn unlink_contrat_gamme(
    db: State<DbPool>,
    id_contrat: i64,
    id_gamme: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM contrats_gammes WHERE id_contrat = ?1 AND id_gamme = ?2",
        params![id_contrat, id_gamme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
