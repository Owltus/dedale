use rusqlite::params;
use tauri::State;

use crate::db::DbPool;
use crate::models::modeles_equipements::{
    CategorieModele, CategorieModeleInput,
    ChampModele, ChampModeleInput, ModeleEquipement, ModeleEquipementInput,
    ValeurChampEquipement, ValeurEquipementInput,
};

// ════════════════════════════════════════════════════════════════════════════
// ── Catégories de modèles (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

fn row_to_categorie(row: &rusqlite::Row) -> rusqlite::Result<CategorieModele> {
    Ok(CategorieModele {
        id_categorie: row.get(0)?,
        nom_categorie: row.get(1)?,
        description: row.get(2)?,
    })
}

#[tauri::command]
pub fn get_categories_modeles(db: State<DbPool>) -> Result<Vec<CategorieModele>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached("SELECT id_categorie, nom_categorie, description FROM categories_modeles ORDER BY nom_categorie")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_categorie).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_categorie_modele(
    db: State<DbPool>,
    input: CategorieModeleInput,
) -> Result<CategorieModele, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO categories_modeles (nom_categorie, description) VALUES (?1, ?2)",
        params![input.nom_categorie, input.description],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id_categorie, nom_categorie, description FROM categories_modeles WHERE id_categorie = ?1",
        params![id],
        row_to_categorie,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_categorie_modele(
    db: State<DbPool>,
    id: i64,
    input: CategorieModeleInput,
) -> Result<CategorieModele, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE categories_modeles SET nom_categorie = ?1, description = ?2 WHERE id_categorie = ?3",
        params![input.nom_categorie, input.description, id],
    )
    .map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id_categorie, nom_categorie, description FROM categories_modeles WHERE id_categorie = ?1",
        params![id],
        row_to_categorie,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_categorie_modele(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    // Vérifier si des modèles utilisent cette catégorie
    let nb: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM modeles_equipements WHERE id_categorie = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if nb > 0 {
        return Err(format!(
            "Impossible de supprimer cette catégorie : {} modèle(s) l'utilise(nt). Retirez d'abord les modèles de cette catégorie.",
            nb
        ));
    }
    conn.execute(
        "DELETE FROM categories_modeles WHERE id_categorie = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Modèles d'équipement (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

const MODELE_SELECT: &str =
    "SELECT me.id_modele_equipement, me.nom_modele, me.description, \
     me.id_categorie, cat.nom_categorie, \
     me.date_creation, me.date_modification, \
     (SELECT COUNT(*) FROM champs_modele cm WHERE cm.id_modele_equipement = me.id_modele_equipement AND cm.est_archive = 0) AS nb_champs, \
     (SELECT COUNT(*) FROM familles_equipements fe WHERE fe.id_modele_equipement = me.id_modele_equipement) AS nb_familles \
     FROM modeles_equipements me \
     LEFT JOIN categories_modeles cat ON cat.id_categorie = me.id_categorie";

fn row_to_modele(row: &rusqlite::Row) -> rusqlite::Result<ModeleEquipement> {
    Ok(ModeleEquipement {
        id_modele_equipement: row.get(0)?,
        nom_modele: row.get(1)?,
        description: row.get(2)?,
        id_categorie: row.get(3)?,
        nom_categorie: row.get(4)?,
        date_creation: row.get(5)?,
        date_modification: row.get(6)?,
        nb_champs: row.get(7)?,
        nb_familles: row.get(8)?,
    })
}

#[tauri::command]
pub fn get_modeles_equipements(db: State<DbPool>) -> Result<Vec<ModeleEquipement>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("{} ORDER BY me.nom_modele", MODELE_SELECT);
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], row_to_modele).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_modele_equipement(db: State<DbPool>, id: i64) -> Result<ModeleEquipement, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!("{} WHERE me.id_modele_equipement = ?1", MODELE_SELECT);
    conn.query_row(&sql, params![id], row_to_modele)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_modele_equipement(
    db: State<DbPool>,
    input: ModeleEquipementInput,
) -> Result<ModeleEquipement, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO modeles_equipements (nom_modele, description, id_categorie) VALUES (?1, ?2, ?3)",
        params![input.nom_modele, input.description, input.id_categorie],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!("{} WHERE me.id_modele_equipement = ?1", MODELE_SELECT);
    conn.query_row(&sql, params![id], row_to_modele)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_modele_equipement(
    db: State<DbPool>,
    id: i64,
    input: ModeleEquipementInput,
) -> Result<ModeleEquipement, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE modeles_equipements SET nom_modele = ?1, description = ?2, id_categorie = ?3 \
         WHERE id_modele_equipement = ?4",
        params![input.nom_modele, input.description, input.id_categorie, id],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!("{} WHERE me.id_modele_equipement = ?1", MODELE_SELECT);
    conn.query_row(&sql, params![id], row_to_modele)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_modele_equipement(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    // Vérifier si des familles utilisent ce modèle
    let nb_familles: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM familles_equipements WHERE id_modele_equipement = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if nb_familles > 0 {
        return Err(format!(
            "Impossible de supprimer ce modèle : {} famille(s) d'équipement l'utilise(nt). Supprimez d'abord les familles liées.",
            nb_familles
        ));
    }
    conn.execute(
        "DELETE FROM modeles_equipements WHERE id_modele_equipement = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Champs d'un modèle (CRUD) ──
// ════════════════════════════════════════════════════════════════════════════

const CHAMP_COLUMNS: &str =
    "id_champ, id_modele_equipement, nom_champ, type_champ, unite, \
     est_obligatoire, ordre, valeurs_possibles, valeur_defaut, est_archive";

fn row_to_champ(row: &rusqlite::Row) -> rusqlite::Result<ChampModele> {
    Ok(ChampModele {
        id_champ: row.get(0)?,
        id_modele_equipement: row.get(1)?,
        nom_champ: row.get(2)?,
        type_champ: row.get(3)?,
        unite: row.get(4)?,
        est_obligatoire: row.get(5)?,
        ordre: row.get(6)?,
        valeurs_possibles: row.get(7)?,
        valeur_defaut: row.get(8)?,
        est_archive: row.get(9)?,
    })
}

#[tauri::command]
pub fn get_champs_modele(
    db: State<DbPool>,
    id_modele_equipement: i64,
) -> Result<Vec<ChampModele>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM champs_modele WHERE id_modele_equipement = ?1 ORDER BY ordre, nom_champ",
        CHAMP_COLUMNS
    );
    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_modele_equipement], row_to_champ)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_champ_modele(
    db: State<DbPool>,
    input: ChampModeleInput,
) -> Result<ChampModele, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO champs_modele (id_modele_equipement, nom_champ, type_champ, unite, \
         est_obligatoire, ordre, valeurs_possibles, valeur_defaut) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            input.id_modele_equipement,
            input.nom_champ,
            input.type_champ,
            input.unite,
            input.est_obligatoire,
            input.ordre,
            input.valeurs_possibles,
            input.valeur_defaut,
        ],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    let sql = format!(
        "SELECT {} FROM champs_modele WHERE id_champ = ?1",
        CHAMP_COLUMNS
    );
    conn.query_row(&sql, params![id], row_to_champ)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_champ_modele(
    db: State<DbPool>,
    id: i64,
    input: ChampModeleInput,
) -> Result<ChampModele, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE champs_modele SET nom_champ = ?1, type_champ = ?2, unite = ?3, \
         est_obligatoire = ?4, ordre = ?5, valeurs_possibles = ?6, valeur_defaut = ?7 WHERE id_champ = ?8",
        params![
            input.nom_champ,
            input.type_champ,
            input.unite,
            input.est_obligatoire,
            input.ordre,
            input.valeurs_possibles,
            input.valeur_defaut,
            id,
        ],
    )
    .map_err(|e| e.to_string())?;
    let sql = format!(
        "SELECT {} FROM champs_modele WHERE id_champ = ?1",
        CHAMP_COLUMNS
    );
    conn.query_row(&sql, params![id], row_to_champ)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_champ_modele(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE champs_modele SET est_archive = 1 WHERE id_champ = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Supprime un champ s'il n'a aucune valeur (le trigger bloque sinon)
#[tauri::command]
pub fn delete_champ_modele(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM champs_modele WHERE id_champ = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_champs_modele(
    db: State<DbPool>,
    id_modele_equipement: i64,
    ids: Vec<i64>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    // Vérifier que la liste contient tous les champs du modèle
    let expected: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM champs_modele WHERE id_modele_equipement = ?1",
            params![id_modele_equipement],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if ids.len() as i64 != expected {
        return Err(format!(
            "Liste de réordonnancement incomplète : {} IDs reçus, {} attendus",
            ids.len(),
            expected
        ));
    }
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (index, id_champ) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE champs_modele SET ordre = ?1 \
             WHERE id_champ = ?2 AND id_modele_equipement = ?3",
            params![index as i64, id_champ, id_modele_equipement],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// ════════════════════════════════════════════════════════════════════════════
// ── Valeurs des champs pour un équipement ──
// ════════════════════════════════════════════════════════════════════════════

#[tauri::command]
pub fn get_valeurs_equipement(
    db: State<DbPool>,
    id_equipement: i64,
) -> Result<Vec<ValeurChampEquipement>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare_cached(
            "SELECT cm.id_champ, cm.nom_champ, cm.type_champ, cm.unite, \
             cm.est_obligatoire, cm.ordre, cm.valeurs_possibles, cm.valeur_defaut, \
             cm.est_archive, ve.valeur \
             FROM champs_modele cm \
             JOIN modeles_equipements me ON cm.id_modele_equipement = me.id_modele_equipement \
             JOIN familles_equipements fe ON fe.id_modele_equipement = me.id_modele_equipement \
             JOIN equipements e ON e.id_famille = fe.id_famille \
             LEFT JOIN valeurs_equipements ve ON ve.id_champ = cm.id_champ AND ve.id_equipement = e.id_equipement \
             WHERE e.id_equipement = ?1 \
             ORDER BY cm.ordre, cm.nom_champ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![id_equipement], |row| {
            Ok(ValeurChampEquipement {
                id_champ: row.get(0)?,
                nom_champ: row.get(1)?,
                type_champ: row.get(2)?,
                unite: row.get(3)?,
                est_obligatoire: row.get(4)?,
                ordre: row.get(5)?,
                valeurs_possibles: row.get(6)?,
                valeur_defaut: row.get(7)?,
                est_archive: row.get(8)?,
                valeur: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_valeurs_equipement(
    db: State<DbPool>,
    id_equipement: i64,
    valeurs: Vec<ValeurEquipementInput>,
) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for v in &valeurs {
        if let Some(ref val) = v.valeur {
            tx.execute(
                "INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur) \
                 VALUES (?1, ?2, ?3) \
                 ON CONFLICT(id_equipement, id_champ) DO UPDATE SET valeur = ?3",
                params![id_equipement, v.id_champ, val],
            )
            .map_err(|e| e.to_string())?;
        } else {
            tx.execute(
                "DELETE FROM valeurs_equipements \
                 WHERE id_equipement = ?1 AND id_champ = ?2",
                params![id_equipement, v.id_champ],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
