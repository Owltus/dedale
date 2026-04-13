use tauri::State;
use crate::db::DbPool;
use crate::models::dashboard::*;
use crate::models::ordres_travail::OtListItem;
use crate::commands::helpers::ot_list::query_ot_list;

/// Lundi de la semaine ISO courante en SQL
/// '+1 day' évite le bug SQLite où weekday 1 renvoie today quand today=lundi
const LUNDI_COURANT: &str = "date('now', '+1 day', 'weekday 1', '-7 days')";
const LUNDI_PROCHAIN: &str = "date('now', '+1 day', 'weekday 1')";

/// Récupère toutes les données du tableau de bord en une seule commande
#[tauri::command]
pub fn get_dashboard_data(db: State<DbPool>) -> Result<DashboardData, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;

    // Donut : OT en retard (avant le lundi de la semaine ISO courante)
    let nb_ot_en_retard: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM ordres_travail \
         WHERE date_prevue < {LUNDI_COURANT} \
         AND id_statut_ot IN (1, 5)"),
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Donut : OT cette semaine ISO par statut (prévus, démarrés ou clôturés cette semaine)
    let mut stmt_cs = conn.prepare_cached(
        &format!("SELECT CASE WHEN id_statut_ot = 1 AND est_automatique = 1 THEN 11 ELSE id_statut_ot END, \
         COUNT(*) FROM ordres_travail \
         WHERE (date_prevue >= {LUNDI_COURANT} AND date_prevue < {LUNDI_PROCHAIN}) \
            OR (date_debut >= {LUNDI_COURANT} AND date_debut < {LUNDI_PROCHAIN}) \
            OR (date_cloture >= {LUNDI_COURANT} AND date_cloture < {LUNDI_PROCHAIN}) \
         GROUP BY 1 ORDER BY 1"),
    ).map_err(|e| e.to_string())?;
    let ot_cette_semaine = stmt_cs.query_map([], |row| {
        Ok(OtParStatut { id_statut: row.get(0)?, nombre: row.get(1)? })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Donut : OT en cours hors semaine courante (évite le doublon avec « cette semaine »)
    let nb_ot_en_cours: i64 = conn.query_row(
        &format!("SELECT COUNT(*) FROM ordres_travail \
         WHERE id_statut_ot = 2 \
         AND (date_prevue < {LUNDI_COURANT} OR date_prevue >= {LUNDI_PROCHAIN})"),
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // KPI : DI ouvertes
    let nb_di_ouvertes: i64 = conn.query_row(
        "SELECT COUNT(*) FROM demandes_intervention \
         WHERE id_statut_di IN (1, 3)",
        [],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    // Alertes : contrats expirant dans 30 jours
    let mut stmt = conn.prepare_cached(
        "SELECT c.id_contrat, p.libelle, c.date_fin \
         FROM contrats c \
         JOIN prestataires p ON c.id_prestataire = p.id_prestataire \
         WHERE c.est_archive = 0 AND c.date_resiliation IS NULL \
         AND c.date_fin IS NOT NULL \
         AND c.date_fin <= date('now', '+30 days') \
         AND c.date_fin >= date('now') \
         ORDER BY c.date_fin ASC"
    ).map_err(|e| e.to_string())?;
    let contrats_expirant_30j = stmt.query_map([], |row| {
        Ok(ContratAlerte {
            id_contrat: row.get(0)?,
            nom_prestataire: row.get(1)?,
            date_fin: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Alertes : gammes réglementaires sans OT planifié
    let mut stmt2 = conn.prepare_cached(
        "SELECT g.id_gamme, g.nom_gamme, fg.nom_famille \
         FROM gammes g \
         JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
         WHERE g.est_active = 1 AND g.est_reglementaire = 1 \
         AND NOT EXISTS ( \
             SELECT 1 FROM ordres_travail ot \
             WHERE ot.id_gamme = g.id_gamme AND ot.id_statut_ot IN (1, 2, 5) \
         )"
    ).map_err(|e| e.to_string())?;
    let gammes_regl_sans_ot = stmt2.query_map([], |row| {
        Ok(GammeAlerte {
            id_gamme: row.get(0)?,
            nom_gamme: row.get(1)?,
            nom_famille: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Alertes : OT stagnants (statut « En cours » depuis plus de 30 jours)
    let mut stmt3 = conn.prepare_cached(
        "SELECT id_ordre_travail, nom_gamme, date_debut \
         FROM ordres_travail \
         WHERE id_statut_ot = 2 AND date_debut < date('now', '-30 days')"
    ).map_err(|e| e.to_string())?;
    let ot_stagnants = stmt3.query_map([], |row| {
        Ok(OtAlerte {
            id_ordre_travail: row.get(0)?,
            nom_gamme: row.get(1)?,
            date_debut: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Tableau : 10 prochains OT
    let mut stmt4 = conn.prepare_cached(
        "SELECT id_ordre_travail, nom_gamme, date_prevue, id_statut_ot, id_priorite, nom_prestataire, id_image \
         FROM ordres_travail \
         WHERE id_statut_ot NOT IN (3, 4) AND date_prevue >= date('now') \
         ORDER BY date_prevue ASC LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let prochains_ot = stmt4.query_map([], |row| {
        Ok(OtDashboardItem {
            id_ordre_travail: row.get(0)?,
            nom_gamme: row.get(1)?,
            date_prevue: row.get(2)?,
            id_statut_ot: row.get(3)?,
            id_priorite: row.get(4)?,
            nom_prestataire: row.get(5)?,
            id_image: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Tableau : 10 dernières DI
    let mut stmt5 = conn.prepare_cached(
        "SELECT id_di, libelle_constat, date_constat, id_statut_di \
         FROM demandes_intervention \
         ORDER BY date_creation DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let dernieres_di = stmt5.query_map([], |row| {
        Ok(DiDashboardItem {
            id_di: row.get(0)?,
            libelle_constat: row.get(1)?,
            date_constat: row.get(2)?,
            id_statut_di: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Tableau : OT en retard
    let mut stmt6 = conn.prepare_cached(
        "SELECT id_ordre_travail, nom_gamme, date_prevue, id_statut_ot, id_priorite, nom_prestataire, id_image \
         FROM ordres_travail \
         WHERE date_prevue < date('now') AND id_statut_ot IN (1, 2, 5) \
         ORDER BY date_prevue ASC"
    ).map_err(|e| e.to_string())?;
    let ot_en_retard = stmt6.query_map([], |row| {
        Ok(OtDashboardItem {
            id_ordre_travail: row.get(0)?,
            nom_gamme: row.get(1)?,
            date_prevue: row.get(2)?,
            id_statut_ot: row.get(3)?,
            id_priorite: row.get(4)?,
            nom_prestataire: row.get(5)?,
            id_image: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Tableau : contrats actifs triés par date d'échéance la plus proche
    // WHERE filtre déjà archivé et résilié — seuls 3 statuts possibles : À venir, Expiré, Actif
    let mut stmt7 = conn.prepare_cached(
        "SELECT c.id_contrat, c.reference, p.libelle, c.date_debut, c.date_fin, \
         c.duree_cycle_mois, p.id_image \
         FROM contrats c \
         JOIN prestataires p ON c.id_prestataire = p.id_prestataire \
         WHERE c.est_archive = 0 AND c.date_resiliation IS NULL \
         ORDER BY \
           CASE WHEN c.date_fin IS NULL THEN 1 ELSE 0 END, \
           c.date_fin ASC \
         LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let contrats_dashboard = stmt7.query_map([], |row| {
        let date_debut: String = row.get(3)?;
        let date_fin: Option<String> = row.get(4)?;
        let statut = if date_debut > today {
            "À venir".to_string()
        } else if let Some(ref fin) = date_fin {
            if fin.as_str() < today.as_str() { "Expiré".to_string() } else { "Actif".to_string() }
        } else {
            "Actif".to_string()
        };
        Ok(ContratDashboardItem {
            id_contrat: row.get(0)?,
            reference: row.get(1)?,
            nom_prestataire: row.get(2)?,
            date_debut,
            date_fin,
            duree_cycle_mois: row.get(5)?,
            statut,
            id_image_prestataire: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Tableau : 10 derniers documents ajoutés
    let mut stmt8 = conn.prepare_cached(
        "SELECT d.id_document, d.nom_original, td.nom, d.date_upload \
         FROM documents d \
         JOIN types_documents td ON d.id_type_document = td.id_type_document \
         ORDER BY d.date_upload DESC LIMIT 10"
    ).map_err(|e| e.to_string())?;
    let derniers_documents = stmt8.query_map([], |row| {
        Ok(DocumentDashboardItem {
            id_document: row.get(0)?,
            nom_original: row.get(1)?,
            nom_type: row.get(2)?,
            date_upload: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    // Flags d'onboarding
    let has_etablissement: bool = conn.query_row(
        "SELECT COUNT(*) FROM etablissements", [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;
    let has_localisations: bool = conn.query_row(
        "SELECT COUNT(*) FROM batiments", [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;
    let has_equipements: bool = conn.query_row(
        "SELECT COUNT(*) FROM equipements", [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;
    let has_prestataires: bool = conn.query_row(
        "SELECT COUNT(*) FROM prestataires WHERE id_prestataire != 1", [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;
    let has_contrats: bool = conn.query_row(
        "SELECT COUNT(*) FROM contrats WHERE id_prestataire != 1", [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;
    let has_gammes: bool = conn.query_row(
        "SELECT COUNT(*) FROM gammes", [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;
    let has_ot: bool = conn.query_row(
        "SELECT COUNT(*) FROM ordres_travail", [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;

    Ok(DashboardData {
        nb_ot_en_retard,
        ot_cette_semaine,
        nb_ot_en_cours,
        nb_di_ouvertes,
        nb_contrats_a_risque: contrats_expirant_30j.len() as i64,
        contrats_expirant_30j,
        gammes_regl_sans_ot,
        ot_stagnants,
        prochains_ot,
        dernieres_di,
        ot_en_retard,
        contrats_dashboard,
        derniers_documents,
        has_etablissement,
        has_localisations,
        has_equipements,
        has_prestataires,
        has_contrats,
        has_gammes,
        has_ot,
    })
}

/// Données hiérarchiques domaine → famille → gamme pour le sunburst
#[tauri::command]
pub fn get_sunburst_gammes(db: State<DbPool>) -> Result<Vec<SunburstGamme>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare_cached(
        &format!(
        "SELECT dg.id_domaine_gamme, dg.nom_domaine, fg.id_famille_gamme, fg.nom_famille, \
         g.id_gamme, g.nom_gamme, g.est_active, \
         COALESCE(agg.nb_total, 0), \
         COALESCE(agg.nb_retard, 0), \
         COALESCE(agg.nb_reouvert, 0), \
         COALESCE(agg.nb_en_cours, 0), \
         agg.prochaine_date, \
         p.jours_periodicite \
         FROM gammes g \
         JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme \
         JOIN domaines_gammes dg ON fg.id_domaine_gamme = dg.id_domaine_gamme \
         JOIN periodicites p ON g.id_periodicite = p.id_periodicite \
         LEFT JOIN ( \
             SELECT id_gamme, \
               COUNT(*) AS nb_total, \
               SUM(CASE WHEN date_prevue < {LUNDI_COURANT} AND id_statut_ot IN (1, 5) THEN 1 ELSE 0 END) AS nb_retard, \
               SUM(CASE WHEN id_statut_ot = 5 THEN 1 ELSE 0 END) AS nb_reouvert, \
               SUM(CASE WHEN id_statut_ot = 2 THEN 1 ELSE 0 END) AS nb_en_cours, \
               MIN(CASE WHEN id_statut_ot IN (1, 2, 5) AND date_prevue >= {LUNDI_COURANT} THEN date_prevue END) AS prochaine_date \
             FROM ordres_travail \
             WHERE id_statut_ot NOT IN (3, 4) \
             GROUP BY id_gamme \
         ) agg ON agg.id_gamme = g.id_gamme \
         ORDER BY dg.nom_domaine, fg.nom_famille, g.nom_gamme")
    ).map_err(|e| e.to_string())?;
    let result = stmt.query_map([], |row| {
        Ok(SunburstGamme {
            id_domaine_gamme: row.get(0)?,
            nom_domaine: row.get(1)?,
            id_famille_gamme: row.get(2)?,
            nom_famille: row.get(3)?,
            id_gamme: row.get(4)?,
            nom_gamme: row.get(5)?,
            est_active: row.get(6)?,
            nb_ot_total: row.get(7)?,
            nb_ot_en_retard: row.get(8)?,
            nb_ot_reouvert: row.get(9)?,
            nb_ot_en_cours: row.get(10)?,
            prochaine_date: row.get(11)?,
            jours_periodicite: row.get(12)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    Ok(result)
}

/// OT du donut par catégorie : "en_retard", "cette_semaine", "en_cours"
#[tauri::command]
pub fn get_donut_ot(db: State<DbPool>, categorie: String) -> Result<Vec<OtListItem>, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let where_clause = match categorie.as_str() {
        "en_retard" => format!(
            "WHERE ot.date_prevue < {LUNDI_COURANT} AND ot.id_statut_ot IN (1, 5)"
        ),
        "cette_semaine" => format!(
            "WHERE (ot.date_prevue >= {LUNDI_COURANT} AND ot.date_prevue < {LUNDI_PROCHAIN}) \
             OR (ot.date_debut >= {LUNDI_COURANT} AND ot.date_debut < {LUNDI_PROCHAIN}) \
             OR (ot.date_cloture >= {LUNDI_COURANT} AND ot.date_cloture < {LUNDI_PROCHAIN})"
        ),
        "en_cours" => format!(
            "WHERE ot.id_statut_ot = 2 \
             AND (ot.date_prevue < {LUNDI_COURANT} OR ot.date_prevue >= {LUNDI_PROCHAIN})"
        ),
        _ => return Err(format!("Catégorie inconnue : {}", categorie)),
    };

    query_ot_list(&conn, &where_clause, None)
}
