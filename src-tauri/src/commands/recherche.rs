use tauri::State;
use rusqlite::params;
use crate::db::DbPool;
use crate::models::transversaux::SearchResult;

/// Recherche globale full-text sur toutes les entités
#[tauri::command]
pub fn recherche_globale(
    db: State<DbPool>,
    query: String,
    limit: i64,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let conn = db.lock().map_err(|e| e.to_string())?;
    // Échapper les caractères LIKE spéciaux pour éviter les wildcards involontaires
    let escaped = query.trim().replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_");
    let pattern = format!("%{}%", escaped);
    let limit = if limit <= 0 { 20 } else { limit };

    let mut stmt = conn.prepare_cached(
        "SELECT 'OT' as entity_type, id_ordre_travail as entity_id, \
                nom_gamme as label, nom_localisation as sublabel \
         FROM ordres_travail WHERE id_statut_ot IN (1, 2, 5) AND nom_gamme LIKE ?1 ESCAPE '\\' \
         UNION ALL \
         SELECT 'Gamme', id_gamme, nom_gamme, \
                (SELECT nom_famille FROM familles_gammes WHERE id_famille_gamme = g.id_famille_gamme) \
         FROM gammes g WHERE nom_gamme LIKE ?1 ESCAPE '\\' \
         UNION ALL \
         SELECT 'Prestataire', id_prestataire, libelle, ville \
         FROM prestataires WHERE libelle LIKE ?1 ESCAPE '\\' \
         UNION ALL \
         SELECT 'Équipement', id_equipement, nom_affichage, commentaires \
         FROM equipements WHERE nom_affichage LIKE ?1 ESCAPE '\\' \
         UNION ALL \
         SELECT 'Bâtiment', id_batiment, nom, description \
         FROM batiments WHERE nom LIKE ?1 ESCAPE '\\' \
         UNION ALL \
         SELECT 'Niveau', id_niveau, nom, description \
         FROM niveaux WHERE nom LIKE ?1 ESCAPE '\\' \
         UNION ALL \
         SELECT 'Local', id_local, nom, description \
         FROM locaux WHERE nom LIKE ?1 ESCAPE '\\' \
         UNION ALL \
         SELECT 'DI', id_di, libelle_constat, description_constat \
         FROM demandes_intervention WHERE libelle_constat LIKE ?1 ESCAPE '\\' \
         LIMIT ?2"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![pattern, limit], |row| {
        let entity_type: String = row.get(0)?;
        let entity_id: i64 = row.get(1)?;
        let label: String = row.get(2)?;
        let sublabel: Option<String> = row.get(3)?;

        // Construire la route de navigation
        let route = match entity_type.as_str() {
            "OT" => format!("/ordres-travail/{}", entity_id),
            "Gamme" => format!("/gammes/{}", entity_id),
            "Prestataire" => format!("/prestataires/{}", entity_id),
            "Équipement" => format!("/equipements/{}", entity_id),
            "Bâtiment" => format!("/localisations/batiments/{}", entity_id),
            "Niveau" => format!("/localisations/niveaux/{}", entity_id),
            "Local" => format!("/localisations"),
            "DI" => format!("/demandes/{}", entity_id),
            _ => String::new(),
        };

        Ok(SearchResult { entity_type, entity_id, label, sublabel, route })
    }).map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
