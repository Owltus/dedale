use rusqlite::{Connection, params, params_from_iter};

use crate::models::ordres_travail::OtListItem;

/// Colonnes SELECT pour les listes d'OT enrichies (progression, retard, nb documents)
const OT_LIST_SELECT: &str = "\
    SELECT ot.id_ordre_travail, ot.nom_gamme, ot.description_gamme, ot.date_prevue, ot.date_cloture, ot.id_statut_ot, \
    ot.id_priorite, ot.nom_prestataire, ot.est_reglementaire, ot.nom_localisation, ot.est_automatique, ot.jours_periodicite, \
    ot.id_image, \
    COALESCE( \
      ROUND( \
        CAST((SELECT COUNT(*) FROM operations_execution oe \
              WHERE oe.id_ordre_travail = ot.id_ordre_travail \
              AND oe.id_statut_operation IN (3, 4, 5)) AS REAL) / \
        NULLIF((SELECT COUNT(*) FROM operations_execution oe2 \
                WHERE oe2.id_ordre_travail = ot.id_ordre_travail), 0) * 100 \
      , 0) \
    , 0) AS progression, \
    CASE WHEN ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2, 5) \
         THEN 1 ELSE 0 END AS est_en_retard, \
    (SELECT COUNT(*) FROM documents_ordres_travail dot \
     WHERE dot.id_ordre_travail = ot.id_ordre_travail) AS nb_documents \
    FROM ordres_travail ot";

/// Tri par priorité métier : Réouvert > Retard > En cours > Planifié > Autres
const OT_LIST_ORDER: &str = "\
    ORDER BY \
      CASE \
        WHEN ot.id_statut_ot = 5 THEN 1 \
        WHEN ot.date_prevue < date('now') AND ot.id_statut_ot IN (1, 2) THEN 2 \
        WHEN ot.id_statut_ot = 2 THEN 3 \
        WHEN ot.id_statut_ot = 1 THEN 4 \
        ELSE 5 \
      END, \
      ot.date_prevue ASC";

/// Construit un OtListItem depuis une ligne SQL (16 colonnes)
fn row_to_ot_list_item(row: &rusqlite::Row) -> rusqlite::Result<OtListItem> {
    Ok(OtListItem {
        id_ordre_travail: row.get(0)?,
        nom_gamme: row.get(1)?,
        description_gamme: row.get(2)?,
        date_prevue: row.get(3)?,
        date_cloture: row.get(4)?,
        id_statut_ot: row.get(5)?,
        id_priorite: row.get(6)?,
        nom_prestataire: row.get(7)?,
        est_reglementaire: row.get(8)?,
        nom_localisation: row.get(9)?,
        est_automatique: row.get(10)?,
        jours_periodicite: row.get(11)?,
        id_image: row.get(12)?,
        progression: row.get(13)?,
        est_en_retard: row.get(14)?,
        nb_documents: row.get(15)?,
    })
}

/// Exécute une requête OT liste avec JOIN/WHERE optionnel et un paramètre optionnel.
///
/// # Sécurité SQL
/// `join_where` est concaténé dans le SQL — NE JAMAIS passer d'input utilisateur.
/// Tous les appels doivent utiliser des littéraux hardcodés (ex: "WHERE ot.id_gamme = ?1").
pub fn query_ot_list(
    conn: &Connection,
    join_where: &str,
    param: Option<i64>,
) -> Result<Vec<OtListItem>, String> {
    let sql = format!("{} {} {}", OT_LIST_SELECT, join_where, OT_LIST_ORDER);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = match param {
        Some(id) => stmt.query_map(params![id], row_to_ot_list_item),
        None => stmt.query_map([], row_to_ot_list_item),
    }
    .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Récupère les OT par liste d'IDs (pour le planning multi-OT par cellule)
pub fn query_ot_list_by_ids(
    conn: &Connection,
    ids: &[i64],
) -> Result<Vec<OtListItem>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let placeholders: String = (1..=ids.len()).map(|i| format!("?{}", i)).collect::<Vec<_>>().join(", ");
    let sql = format!("{} WHERE ot.id_ordre_travail IN ({}) {}", OT_LIST_SELECT, placeholders, OT_LIST_ORDER);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(params_from_iter(ids.iter()), row_to_ot_list_item)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
