use rusqlite::params;
use std::collections::HashMap;
use tauri::State;

use crate::db::DbPool;
use crate::models::releves::{OperationReleves, RelevePoint, RelevesGammeListItem};

/// Liste les gammes pour lesquelles au moins un relevé mesure a été enregistré
/// (au moins une `operations_execution` avec `unite_symbole IS NOT NULL`).
/// `nb_operations_mesure` : nombre distinct d'opérations mesure rencontrées (groupées par
/// (id_type_source, id_source) — couvre opérations spécifiques et issues de gammes types).
/// `nb_releves_12m` : relevés sur les 12 derniers mois ; `date_dernier_releve` : tout historique.
#[tauri::command]
pub fn get_gammes_avec_releves(
    db: State<DbPool>,
) -> Result<Vec<RelevesGammeListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let sql = "
        SELECT
            g.id_gamme,
            g.nom_gamme,
            fg.nom_famille,
            dg.nom_domaine,
            g.id_image,
            p.jours_periodicite,
            COUNT(DISTINCT oe.id_type_source || '/' || oe.id_source) AS nb_operations_mesure,
            SUM(CASE
                WHEN oe.valeur_mesuree IS NOT NULL
                 AND COALESCE(oe.date_execution, ot.date_prevue) >= DATE('now', '-12 months')
                THEN 1 ELSE 0 END) AS nb_releves_12m,
            MAX(CASE WHEN oe.valeur_mesuree IS NOT NULL
                     THEN COALESCE(oe.date_execution, ot.date_prevue) END) AS date_dernier_releve
        FROM gammes g
        JOIN ordres_travail ot ON ot.id_gamme = g.id_gamme
        JOIN operations_execution oe ON oe.id_ordre_travail = ot.id_ordre_travail
        JOIN periodicites p ON p.id_periodicite = g.id_periodicite
        LEFT JOIN familles_gammes fg ON fg.id_famille_gamme = g.id_famille_gamme
        LEFT JOIN domaines_gammes dg ON dg.id_domaine_gamme = fg.id_domaine_gamme
        WHERE oe.unite_symbole IS NOT NULL
        GROUP BY g.id_gamme
        ORDER BY g.nom_gamme COLLATE NOCASE
    ";

    let mut stmt = conn.prepare_cached(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(RelevesGammeListItem {
                id_gamme: row.get(0)?,
                nom_gamme: row.get(1)?,
                nom_famille: row.get(2)?,
                nom_domaine: row.get(3)?,
                id_image: row.get(4)?,
                jours_periodicite: row.get(5)?,
                nb_operations_mesure: row.get(6)?,
                nb_releves_12m: row.get(7)?,
                date_dernier_releve: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

/// Renvoie tous les relevés d'une gamme groupés par opération mesure.
/// `since` : date ISO `YYYY-MM-DD` filtrant les points (`None` = tout l'historique).
/// Les métadonnées (nom, unité, seuils) viennent du snapshot le plus récent — last-write-wins
/// dans le tri ASC garantit qu'on reflète la définition la plus récente de l'opération.
#[tauri::command]
pub fn get_releves_by_gamme(
    db: State<DbPool>,
    id_gamme: i64,
    since: Option<String>,
) -> Result<Vec<OperationReleves>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    let sql = "
        SELECT
            oe.id_type_source,
            oe.id_source,
            oe.nom_operation,
            oe.unite_symbole,
            oe.seuil_minimum,
            oe.seuil_maximum,
            oe.id_ordre_travail,
            COALESCE(oe.date_execution, ot.date_prevue) AS date_releve,
            oe.valeur_mesuree,
            oe.est_conforme
        FROM operations_execution oe
        JOIN ordres_travail ot ON ot.id_ordre_travail = oe.id_ordre_travail
        WHERE ot.id_gamme = ?1
          AND oe.unite_symbole IS NOT NULL
          AND oe.valeur_mesuree IS NOT NULL
          AND (?2 IS NULL OR COALESCE(oe.date_execution, ot.date_prevue) >= ?2)
        ORDER BY oe.id_type_source, oe.id_source, date_releve ASC
    ";

    let mut stmt = conn.prepare_cached(sql).map_err(|e| e.to_string())?;

    type MetaKey = (i64, i64);
    let mut groups: HashMap<MetaKey, OperationReleves> = HashMap::new();
    let mut order: Vec<MetaKey> = Vec::new();

    let rows = stmt
        .query_map(params![id_gamme, since], |row| {
            Ok((
                (row.get::<_, i64>(0)?, row.get::<_, i64>(1)?),
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, Option<f64>>(5)?,
                RelevePoint {
                    id_ordre_travail: row.get(6)?,
                    date_releve: row.get(7)?,
                    valeur_mesuree: row.get(8)?,
                    est_conforme: row.get(9)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;

    for row in rows {
        let (key, nom, unite, smin, smax, point) = row.map_err(|e| e.to_string())?;
        let entry = groups.entry(key).or_insert_with(|| {
            order.push(key);
            OperationReleves {
                id_type_source: key.0,
                id_source: key.1,
                nom_operation: nom.clone(),
                unite_symbole: unite.clone(),
                seuil_minimum: smin,
                seuil_maximum: smax,
                points: Vec::new(),
            }
        });
        // Last-write-wins : le tri ASC garantit que la dernière itération porte le snapshot le plus récent.
        entry.nom_operation = nom;
        entry.unite_symbole = unite;
        entry.seuil_minimum = smin;
        entry.seuil_maximum = smax;
        entry.points.push(point);
    }

    Ok(order
        .into_iter()
        .map(|key| groups.remove(&key).expect("key inserted just above"))
        .collect())
}
