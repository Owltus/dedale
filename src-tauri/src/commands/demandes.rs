use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::demandes::{
    DemandeIntervention, DiCreateInput, DiEquipementInfo, DiListItem, DiResolutionInput,
    DiUpdateInput,
};

// ════════════════════════════════════════════════════════════════════════════
// ── Colonnes et helpers ──
// ════════════════════════════════════════════════════════════════════════════

/// Colonnes SELECT complètes pour une demande d'intervention (10 colonnes)
const DI_COLS: &str = "id_di, id_statut_di, libelle_constat, description_constat, \
     date_constat, description_resolution, date_resolution, \
     description_resolution_suggeree, date_creation, date_modification";

/// Construit une DemandeIntervention à partir d'une ligne de résultat (10 colonnes)
fn row_to_di(row: &rusqlite::Row) -> rusqlite::Result<DemandeIntervention> {
    Ok(DemandeIntervention {
        id_di: row.get(0)?,
        id_statut_di: row.get(1)?,
        libelle_constat: row.get(2)?,
        description_constat: row.get(3)?,
        date_constat: row.get(4)?,
        description_resolution: row.get(5)?,
        date_resolution: row.get(6)?,
        description_resolution_suggeree: row.get(7)?,
        date_creation: row.get(8)?,
        date_modification: row.get(9)?,
    })
}

// ════════════════════════════════════════════════════════════════════════════
// ── CRUD Demandes d'intervention ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère la liste de toutes les DI
#[tauri::command]
pub fn get_demandes(db: State<DbPool>) -> Result<Vec<DiListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_di, id_statut_di, libelle_constat, date_constat, date_resolution \
             FROM demandes_intervention \
             ORDER BY date_constat DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DiListItem {
                id_di: row.get(0)?,
                id_statut_di: row.get(1)?,
                libelle_constat: row.get(2)?,
                date_constat: row.get(3)?,
                date_resolution: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère une demande d'intervention complète par son identifiant
#[tauri::command]
pub fn get_demande(db: State<DbPool>, id: i64) -> Result<DemandeIntervention, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
        DI_COLS
    );
    conn.query_row(&sql, params![id], row_to_di)
        .map_err(|e| e.to_string())
}

/// Crée une nouvelle demande d'intervention et retourne l'objet complet
/// Le trigger force id_statut_di = 1 (Ouverte) à la création
#[tauri::command]
pub fn create_demande(
    db: State<DbPool>,
    input: DiCreateInput,
) -> Result<DemandeIntervention, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO demandes_intervention \
         (libelle_constat, description_constat, date_constat, \
          description_resolution_suggeree) \
         VALUES (?1, ?2, ?3, ?4)",
        params![
            input.libelle_constat,
            input.description_constat,
            input.date_constat,
            input.description_resolution_suggeree,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
        DI_COLS
    );
    conn.query_row(&sql, params![id], row_to_di)
        .map_err(|e| e.to_string())
}

/// Met à jour les champs modifiables d'une DI et retourne l'objet complet
/// Le trigger bloque la modification si statut = 2 (Résolue)
#[tauri::command]
pub fn update_demande(
    db: State<DbPool>,
    id: i64,
    input: DiUpdateInput,
) -> Result<DemandeIntervention, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Construire dynamiquement les SET pour les champs fournis
    let mut sets: Vec<String> = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(ref v) = input.libelle_constat {
        sets.push(format!("libelle_constat = ?{}", values.len() + 1));
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = input.description_constat {
        sets.push(format!("description_constat = ?{}", values.len() + 1));
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = input.date_constat {
        sets.push(format!("date_constat = ?{}", values.len() + 1));
        values.push(Box::new(v.clone()));
    }
    if let Some(ref v) = input.description_resolution_suggeree {
        sets.push(format!("description_resolution_suggeree = ?{}", values.len() + 1));
        values.push(Box::new(v.clone()));
    }

    if sets.is_empty() {
        // Rien à mettre à jour — retourner l'état actuel
        let sql = format!(
            "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
            DI_COLS
        );
        return conn
            .query_row(&sql, params![id], row_to_di)
            .map_err(|e| e.to_string());
    }

    // Ajouter l'id comme dernier paramètre
    let id_param_idx = values.len() + 1;
    values.push(Box::new(id));

    let sql = format!(
        "UPDATE demandes_intervention SET {} WHERE id_di = ?{}",
        sets.join(", "),
        id_param_idx
    );

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
    conn.execute(&sql, params_refs.as_slice())
        .map_err(|e| e.to_string())?;

    // Re-requêter pour retourner l'objet complet après triggers
    let select_sql = format!(
        "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
        DI_COLS
    );
    conn.query_row(&select_sql, params![id], row_to_di)
        .map_err(|e| e.to_string())
}

/// Supprime une demande d'intervention
#[tauri::command]
pub fn delete_demande(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM demandes_intervention WHERE id_di = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Changements de statut ──
// ════════════════════════════════════════════════════════════════════════════

/// Résout une DI : passe en statut 2 (Résolue) avec date et description de résolution
/// Le trigger valide que les champs de résolution sont présents
#[tauri::command]
pub fn resoudre_demande(
    db: State<DbPool>,
    id: i64,
    input: DiResolutionInput,
) -> Result<DemandeIntervention, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE demandes_intervention \
         SET id_statut_di = 2, date_resolution = ?1, description_resolution = ?2 \
         WHERE id_di = ?3",
        params![input.date_resolution, input.description_resolution, id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
        DI_COLS
    );
    conn.query_row(&sql, params![id], row_to_di)
        .map_err(|e| e.to_string())
}

/// Réouvre une DI : passe en statut 3 (Réouverte)
#[tauri::command]
pub fn reouvrir_demande(db: State<DbPool>, id: i64) -> Result<DemandeIntervention, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE demandes_intervention SET id_statut_di = 3 WHERE id_di = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
        DI_COLS
    );
    conn.query_row(&sql, params![id], row_to_di)
        .map_err(|e| e.to_string())
}

/// Repasse une DI en statut 1 (Ouverte)
#[tauri::command]
pub fn repasser_ouverte_demande(
    db: State<DbPool>,
    id: i64,
) -> Result<DemandeIntervention, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE demandes_intervention SET id_statut_di = 1 WHERE id_di = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
        DI_COLS
    );
    conn.query_row(&sql, params![id], row_to_di)
        .map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Création depuis un modèle ──
// ════════════════════════════════════════════════════════════════════════════

/// Crée une DI pré-remplie à partir d'un modèle de DI
/// Le champ description_resolution du modèle devient description_resolution_suggeree de la DI
#[tauri::command]
pub fn create_demande_from_modele(
    db: State<DbPool>,
    id_modele_di: i64,
) -> Result<DemandeIntervention, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Lire le modèle
    let (libelle_constat, description_constat, description_resolution): (
        String,
        String,
        Option<String>,
    ) = conn
        .query_row(
            "SELECT libelle_constat, description_constat, description_resolution \
             FROM modeles_di WHERE id_modele_di = ?1",
            params![id_modele_di],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    // Créer la DI avec les champs du modèle
    conn.execute(
        "INSERT INTO demandes_intervention \
         (libelle_constat, description_constat, description_resolution_suggeree) \
         VALUES (?1, ?2, ?3)",
        params![
            libelle_constat,
            description_constat,
            description_resolution,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM demandes_intervention WHERE id_di = ?1",
        DI_COLS
    );
    conn.query_row(&sql, params![id], row_to_di)
        .map_err(|e| e.to_string())
}

/// Vérifie que la DI n'est pas en statut Résolue (2) avant modification des liaisons
fn check_di_not_resolue(conn: &rusqlite::Connection, id_di: i64) -> Result<(), String> {
    let statut: i64 = conn
        .query_row(
            "SELECT id_statut_di FROM demandes_intervention WHERE id_di = ?1",
            params![id_di],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if statut == 2 {
        return Err("Modification interdite : DI résolue. Réouvrez-la d'abord.".to_string());
    }
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Liaisons DI ↔ gammes ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les IDs des gammes liées à une DI
#[tauri::command]
pub fn get_di_gammes(db: State<DbPool>, id_di: i64) -> Result<Vec<i64>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached("SELECT id_gamme FROM di_gammes WHERE id_di = ?1 ORDER BY id_gamme")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_di], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Lie une gamme à une DI (bloqué si DI résolue)
#[tauri::command]
pub fn link_di_gamme(db: State<DbPool>, id_di: i64, id_gamme: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    check_di_not_resolue(&conn, id_di)?;
    conn.execute(
        "INSERT INTO di_gammes (id_di, id_gamme) VALUES (?1, ?2)",
        params![id_di, id_gamme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime la liaison entre une DI et une gamme (bloqué si DI résolue)
#[tauri::command]
pub fn unlink_di_gamme(db: State<DbPool>, id_di: i64, id_gamme: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    check_di_not_resolue(&conn, id_di)?;
    conn.execute(
        "DELETE FROM di_gammes WHERE id_di = ?1 AND id_gamme = ?2",
        params![id_di, id_gamme],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Liaisons DI ↔ localisations ──
// ════════════════════════════════════════════════════════════════════════════

/// Récupère les IDs des localisations liées à une DI
#[tauri::command]
pub fn get_di_localisations(db: State<DbPool>, id_di: i64) -> Result<Vec<i64>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT id_local FROM di_localisations WHERE id_di = ?1 ORDER BY id_local",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_di], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Lie une localisation à une DI (bloqué si DI résolue)
#[tauri::command]
pub fn link_di_localisation(
    db: State<DbPool>,
    id_di: i64,
    id_local: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    check_di_not_resolue(&conn, id_di)?;
    conn.execute(
        "INSERT INTO di_localisations (id_di, id_local) VALUES (?1, ?2)",
        params![id_di, id_local],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime la liaison entre une DI et une localisation (bloqué si DI résolue)
#[tauri::command]
pub fn unlink_di_localisation(
    db: State<DbPool>,
    id_di: i64,
    id_local: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    check_di_not_resolue(&conn, id_di)?;
    conn.execute(
        "DELETE FROM di_localisations WHERE id_di = ?1 AND id_local = ?2",
        params![id_di, id_local],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Récupère les équipements liés à une DI avec nom et localisation
#[tauri::command]
pub fn get_di_equipements(
    db: State<DbPool>,
    id_di: i64,
) -> Result<Vec<DiEquipementInfo>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT e.id_equipement, e.nom_affichage, \
                    b.nom || ' > ' || n.nom || ' > ' || l.nom \
             FROM di_equipements de \
             JOIN equipements e ON e.id_equipement = de.id_equipement \
             LEFT JOIN locaux l ON l.id_local = e.id_local \
             LEFT JOIN niveaux n ON n.id_niveau = l.id_niveau \
             LEFT JOIN batiments b ON b.id_batiment = n.id_batiment \
             WHERE de.id_di = ?1 ORDER BY e.nom_affichage",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_di], |row| {
            Ok(DiEquipementInfo {
                id_equipement: row.get(0)?,
                nom_affichage: row.get(1)?,
                localisation_label: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Lie un équipement à une DI (bloqué si DI résolue)
#[tauri::command]
pub fn link_di_equipement(
    db: State<DbPool>,
    id_di: i64,
    id_equipement: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    check_di_not_resolue(&conn, id_di)?;
    conn.execute(
        "INSERT INTO di_equipements (id_di, id_equipement) VALUES (?1, ?2)",
        params![id_di, id_equipement],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime la liaison entre une DI et un équipement (bloqué si DI résolue)
#[tauri::command]
pub fn unlink_di_equipement(
    db: State<DbPool>,
    id_di: i64,
    id_equipement: i64,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    check_di_not_resolue(&conn, id_di)?;
    conn.execute(
        "DELETE FROM di_equipements WHERE id_di = ?1 AND id_equipement = ?2",
        params![id_di, id_equipement],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
