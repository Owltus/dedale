use rusqlite::{params, Connection};
use tauri::State;

use crate::db::DbPool;
use crate::models::ordres_travail::{
    OpExecUpdateInput, OperationExecution, OrdreDetailComplet, OrdreTravail, OtCreateInput,
    OtListItem, OtSuivant, OtUpdateInput,
};

// ════════════════════════════════════════════════════════════════════════════
// ── Constantes SQL ──
// ════════════════════════════════════════════════════════════════════════════

/// Colonnes SELECT pour ordres_travail (27 colonnes — tout sauf les colonnes internes)
const OT_COLS: &str = "\
    id_ordre_travail, nom_gamme, description_gamme, est_reglementaire, \
    nom_localisation, nom_famille, nom_prestataire, \
    id_gamme, id_prestataire, id_statut_ot, id_priorite, \
    libelle_periodicite, jours_periodicite, periodicite_jours_valides, \
    id_image, date_prevue, est_automatique, \
    date_debut, date_cloture, commentaires, \
    id_di, id_technicien, nom_technicien, \
    nom_poste, nom_equipement, \
    date_creation, date_modification";

/// Colonnes SELECT pour operations_execution (16 colonnes)
const OP_EXEC_COLS: &str = "\
    id_operation_execution, id_ordre_travail, id_type_source, id_source, \
    nom_operation, description_operation, type_operation, \
    seuil_minimum, seuil_maximum, unite_nom, unite_symbole, \
    id_statut_operation, valeur_mesuree, est_conforme, \
    date_execution, commentaires";

// ════════════════════════════════════════════════════════════════════════════
// ── Helpers de mapping Row → Struct ──
// ════════════════════════════════════════════════════════════════════════════

/// Construit un OrdreTravail complet à partir d'une ligne (27 colonnes)
fn row_to_ot(row: &rusqlite::Row) -> rusqlite::Result<OrdreTravail> {
    Ok(OrdreTravail {
        id_ordre_travail: row.get(0)?,
        nom_gamme: row.get(1)?,
        description_gamme: row.get(2)?,
        est_reglementaire: row.get(3)?,
        nom_localisation: row.get(4)?,
        nom_famille: row.get(5)?,
        nom_prestataire: row.get(6)?,
        id_gamme: row.get(7)?,
        id_prestataire: row.get(8)?,
        id_statut_ot: row.get(9)?,
        id_priorite: row.get(10)?,
        libelle_periodicite: row.get(11)?,
        jours_periodicite: row.get(12)?,
        periodicite_jours_valides: row.get(13)?,
        id_image: row.get(14)?,
        date_prevue: row.get(15)?,
        est_automatique: row.get(16)?,
        date_debut: row.get(17)?,
        date_cloture: row.get(18)?,
        commentaires: row.get(19)?,
        id_di: row.get(20)?,
        id_technicien: row.get(21)?,
        nom_technicien: row.get(22)?,
        nom_poste: row.get(23)?,
        nom_equipement: row.get(24)?,
        date_creation: row.get(25)?,
        date_modification: row.get(26)?,
    })
}

/// Construit une OperationExecution à partir d'une ligne (16 colonnes)
fn row_to_op_exec(row: &rusqlite::Row) -> rusqlite::Result<OperationExecution> {
    Ok(OperationExecution {
        id_operation_execution: row.get(0)?,
        id_ordre_travail: row.get(1)?,
        id_type_source: row.get(2)?,
        id_source: row.get(3)?,
        nom_operation: row.get(4)?,
        description_operation: row.get(5)?,
        type_operation: row.get(6)?,
        seuil_minimum: row.get(7)?,
        seuil_maximum: row.get(8)?,
        unite_nom: row.get(9)?,
        unite_symbole: row.get(10)?,
        id_statut_operation: row.get(11)?,
        valeur_mesuree: row.get(12)?,
        est_conforme: row.get(13)?,
        date_execution: row.get(14)?,
        commentaires: row.get(15)?,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── Helpers de requêtage composé (réutilisables par toutes les commandes) ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère l'OT suivant pour la même gamme (non clôturé/annulé)
fn fetch_ot_suivant(
    conn: &Connection,
    id_gamme: i64,
    id_ot: i64,
) -> Result<Option<OtSuivant>, String> {
    let result = conn.query_row(
        "SELECT id_ordre_travail, date_prevue FROM ordres_travail \
         WHERE id_gamme = ?1 AND id_ordre_travail != ?2 AND id_statut_ot NOT IN (3, 4) \
         ORDER BY date_prevue ASC LIMIT 1",
        params![id_gamme, id_ot],
        |row| {
            Ok(OtSuivant {
                id_ordre_travail: row.get(0)?,
                date_prevue: row.get(1)?,
            })
        },
    );
    match result {
        Ok(suivant) => Ok(Some(suivant)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Récupère le détail complet d'un OT : OT + opérations + OT suivant
/// Fonction centrale réutilisée par toutes les commandes qui retournent un détail
fn fetch_ot_detail(conn: &Connection, id: i64) -> Result<OrdreDetailComplet, String> {
    // 1. Récupérer l'OT complet (27 colonnes)
    let sql_ot = format!(
        "SELECT {} FROM ordres_travail WHERE id_ordre_travail = ?1",
        OT_COLS
    );
    let ot = conn
        .query_row(&sql_ot, params![id], row_to_ot)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                format!("Ordre de travail #{} introuvable", id)
            }
            _ => e.to_string(),
        })?;

    // 2. Récupérer toutes les opérations d'exécution de cet OT
    let sql_ops = format!(
        "SELECT {} FROM operations_execution WHERE id_ordre_travail = ?1 \
         ORDER BY id_operation_execution",
        OP_EXEC_COLS
    );
    let mut stmt = conn.prepare_cached(&sql_ops).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id], row_to_op_exec)
        .map_err(|e| e.to_string())?;
    let operations = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // 3. Récupérer l'OT suivant pour la même gamme
    let ot_suivant = fetch_ot_suivant(conn, ot.id_gamme, ot.id_ordre_travail)?;

    Ok(OrdreDetailComplet {
        ordre_travail: ot,
        operations,
        ot_suivant,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── Commandes Tauri ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère la liste de tous les OT avec progression et indicateur de retard
#[tauri::command]
pub fn get_ordres_travail(db: State<DbPool>) -> Result<Vec<OtListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    super::helpers::ot_list::query_ot_list(&conn, "", None)
}

/// Récupère les OT liés à une famille gamme (via gammes.id_famille_gamme)
#[tauri::command]
pub fn get_ot_by_famille(db: State<DbPool>, id_famille: i64) -> Result<Vec<OtListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    super::helpers::ot_list::query_ot_list(
        &conn,
        "JOIN gammes g ON ot.id_gamme = g.id_gamme WHERE g.id_famille_gamme = ?1",
        Some(id_famille),
    )
}

/// Récupère les OT liés à une gamme
#[tauri::command]
pub fn get_ot_by_gamme(db: State<DbPool>, id_gamme: i64) -> Result<Vec<OtListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    super::helpers::ot_list::query_ot_list(&conn, "WHERE ot.id_gamme = ?1", Some(id_gamme))
}

/// Récupère le détail complet d'un OT (OT + opérations + OT suivant)
#[tauri::command]
pub fn get_ordre_travail(db: State<DbPool>, id: i64) -> Result<OrdreDetailComplet, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    fetch_ot_detail(&conn, id)
}

/// Crée un OT — INSERT avec les colonnes NOT NULL pré-remplies depuis la gamme.
/// Le trigger `creation_ot_complet` (AFTER INSERT) complète les snapshots restants
/// et crée les operations_execution.
/// Après INSERT, re-requête le détail complet pour capturer les effets des triggers.
#[tauri::command]
pub fn create_ordre_travail(
    db: State<DbPool>,
    input: OtCreateInput,
) -> Result<OrdreDetailComplet, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO ordres_travail \
         (id_gamme, id_prestataire, date_prevue, id_priorite, id_technicien, id_di, commentaires, \
          nom_gamme, est_reglementaire, libelle_periodicite, jours_periodicite, periodicite_jours_valides) \
         VALUES (?1, \
                 (SELECT id_prestataire FROM gammes WHERE id_gamme = ?1), \
                 ?2, ?3, ?4, ?5, ?6, \
                 (SELECT nom_gamme FROM gammes WHERE id_gamme = ?1), \
                 (SELECT est_reglementaire FROM gammes WHERE id_gamme = ?1), \
                 '', 0, 0)",
        params![
            input.id_gamme,
            input.date_prevue,
            input.id_priorite,
            input.id_technicien,
            input.id_di,
            input.commentaires,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    // Re-requêter l'état complet après triggers (snapshots figés, opérations créées)
    fetch_ot_detail(&conn, id)
}

/// Met à jour le statut d'un OT — les triggers gèrent les transitions autorisées,
/// le nettoyage des dates, et la réinitialisation en cas de réouverture.
/// Re-requête le détail complet pour détecter les effets cascade.
#[tauri::command]
pub fn update_statut_ot(
    db: State<DbPool>,
    id: i64,
    nouveau_statut: i64,
) -> Result<OrdreDetailComplet, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ordres_travail SET id_statut_ot = ?1 WHERE id_ordre_travail = ?2",
        params![nouveau_statut, id],
    )
    .map_err(|e| e.to_string())?;
    // Re-requêter après triggers (transitions, dates nettoyées, réinitialisation…)
    fetch_ot_detail(&conn, id)
}

/// Met à jour les champs éditables d'un OT actif (priorité, technicien, commentaires).
/// Supprime un OT et ses opérations d'exécution (CASCADE)
#[tauri::command]
pub fn delete_ordre_travail(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM ordres_travail WHERE id_ordre_travail = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Utilise COALESCE pour ne modifier que les champs fournis.
#[tauri::command]
pub fn update_ordre_travail(
    db: State<DbPool>,
    id: i64,
    input: OtUpdateInput,
) -> Result<OrdreDetailComplet, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE ordres_travail SET \
         date_prevue = COALESCE(?1, date_prevue), \
         id_priorite = COALESCE(?2, id_priorite), \
         id_technicien = ?3, \
         commentaires = ?4 \
         WHERE id_ordre_travail = ?5",
        params![input.date_prevue, input.id_priorite, input.id_technicien, input.commentaires, id],
    )
    .map_err(|e| e.to_string())?;
    // Re-requêter le détail complet
    fetch_ot_detail(&conn, id)
}

/// Met à jour une opération d'exécution, puis re-requête le détail complet de l'OT parent.
/// Le trigger `gestion_statut_ot` peut auto-clôturer l'OT si toutes les opérations sont terminées.
#[tauri::command]
pub fn update_operation_execution(
    db: State<DbPool>,
    id: i64,
    input: OpExecUpdateInput,
) -> Result<OrdreDetailComplet, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Mettre à jour l'opération
    conn.execute(
        "UPDATE operations_execution SET \
         id_statut_operation = ?1, \
         valeur_mesuree = ?2, \
         est_conforme = ?3, \
         date_execution = ?4, \
         commentaires = ?5 \
         WHERE id_operation_execution = ?6",
        params![
            input.id_statut_operation,
            input.valeur_mesuree,
            input.est_conforme,
            input.date_execution,
            input.commentaires,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Récupérer l'id_ordre_travail de l'opération pour re-requêter le détail OT
    let id_ot: i64 = conn
        .query_row(
            "SELECT id_ordre_travail FROM operations_execution \
             WHERE id_operation_execution = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // Re-requêter le détail complet (le trigger a peut-être auto-clôturé l'OT)
    fetch_ot_detail(&conn, id_ot)
}

/// Termine en masse une liste d'opérations (statut = 3 « Terminé »).
/// Chaque UPDATE est exécuté individuellement car le trigger `gestion_statut_ot`
/// doit se déclencher après chaque modification.
/// Toutes les opérations doivent appartenir au même OT.
#[tauri::command]
pub fn bulk_terminer_operations(
    db: State<DbPool>,
    ids: Vec<i64>,
    date_execution: String,
) -> Result<OrdreDetailComplet, String> {
    if ids.is_empty() {
        return Err("Aucune opération fournie".to_string());
    }

    let conn = db.lock().map_err(|e| e.to_string())?;

    // Récupérer l'id_ordre_travail de la première opération pour vérification
    let id_ot: i64 = conn
        .query_row(
            "SELECT id_ordre_travail FROM operations_execution \
             WHERE id_operation_execution = ?1",
            params![ids[0]],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                format!("Opération #{} introuvable", ids[0])
            }
            _ => e.to_string(),
        })?;

    // Vérifier que toutes les opérations appartiennent au même OT
    for &op_id in &ids[1..] {
        let ot_check: i64 = conn
            .query_row(
                "SELECT id_ordre_travail FROM operations_execution \
                 WHERE id_operation_execution = ?1",
                params![op_id],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    format!("Opération #{} introuvable", op_id)
                }
                _ => e.to_string(),
            })?;
        if ot_check != id_ot {
            return Err(format!(
                "L'opération #{} n'appartient pas au même ordre de travail (OT #{} attendu, OT #{} trouvé)",
                op_id, id_ot, ot_check
            ));
        }
    }

    // Terminer dans une transaction pour atomicité
    conn.execute_batch("BEGIN IMMEDIATE")
        .map_err(|e| format!("Erreur début transaction : {}", e))?;

    let result = (|| -> Result<(), String> {
        for &op_id in &ids {
            conn.execute(
                "UPDATE operations_execution SET \
                 id_statut_operation = 3, \
                 date_execution = ?1 \
                 WHERE id_operation_execution = ?2",
                params![date_execution, op_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT")
                .map_err(|e| format!("Erreur commit : {}", e))?;
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK");
            return Err(e);
        }
    }

    // Re-requêter le détail complet (le trigger a peut-être auto-clôturé l'OT)
    fetch_ot_detail(&conn, id_ot)
}
