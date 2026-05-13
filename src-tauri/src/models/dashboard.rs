use serde::{Deserialize, Serialize};

/// Alerte contrat expirant
#[derive(Debug, Serialize, Deserialize)]
pub struct ContratAlerte {
    pub id_contrat: i64,
    pub nom_prestataire: String,
    pub date_fin: String,
}

/// Alerte gamme réglementaire sans OT
#[derive(Debug, Serialize, Deserialize)]
pub struct GammeAlerte {
    pub id_gamme: i64,
    pub nom_gamme: String,
    pub nom_famille: String,
}

/// Alerte OT stagnant
#[derive(Debug, Serialize, Deserialize)]
pub struct OtAlerte {
    pub id_ordre_travail: i64,
    pub nom_gamme: String,
    pub date_debut: Option<String>,
}

/// Compteur OT par statut d'affichage (pour le donut)
#[derive(Debug, Serialize, Deserialize)]
pub struct OtParStatut {
    pub id_statut: i64,
    pub nombre: i64,
}

/// Données complètes du dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardData {
    // Donut OT
    pub nb_ot_en_retard: i64,
    pub ot_cette_semaine: Vec<OtParStatut>,
    pub nb_ot_en_cours: i64,
    // KPIs
    pub nb_di_ouvertes: i64,
    pub nb_contrats_a_risque: i64,
    // Alertes
    pub contrats_expirant_30j: Vec<ContratAlerte>,
    pub gammes_regl_sans_ot: Vec<GammeAlerte>,
    pub ot_stagnants: Vec<OtAlerte>,
    // Tableaux
    pub prochains_ot: Vec<OtDashboardItem>,
    pub dernieres_di: Vec<DiDashboardItem>,
    pub ot_en_retard: Vec<OtDashboardItem>,
    pub contrats_dashboard: Vec<ContratDashboardItem>,
    pub derniers_documents: Vec<DocumentDashboardItem>,
    pub ot_regl_sans_doc: Vec<OtDashboardItem>,
    // Onboarding
    pub has_localisations: bool,
    pub has_equipements: bool,
    pub has_prestataires: bool,
    pub has_contrats: bool,
    pub has_gammes: bool,
    pub has_ot: bool,
}

/// OT simplifié pour le dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct OtDashboardItem {
    pub id_ordre_travail: i64,
    pub nom_gamme: String,
    pub date_prevue: String,
    pub id_statut_ot: i64,
    pub id_priorite: i64,
    pub nom_prestataire: Option<String>,
    pub id_image: Option<i64>,
}

/// DI simplifiée pour le dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct DiDashboardItem {
    pub id_di: i64,
    pub constat: String,
    pub date_constat: String,
    pub id_statut_di: i64,
}

/// Contrat simplifié pour le dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct ContratDashboardItem {
    pub id_contrat: i64,
    pub reference: String,
    pub nom_prestataire: String,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub duree_cycle_mois: Option<i64>,
    pub statut: String,
    pub id_image_prestataire: Option<i64>,
}

/// Événement contrat pour la timeline dashboard
/// `duree_jours` > 0 signifie une période (ex: fenêtre de résiliation) — l'événement
/// s'étend de `date_evenement` à `date_evenement + duree_jours`. `None` = date ponctuelle.
#[derive(Debug, Serialize, Deserialize)]
pub struct ContratTimelineEvent {
    pub id_contrat: i64,
    pub id_prestataire: i64,
    pub reference: String,
    pub nom_prestataire: String,
    pub type_evenement: String,
    pub date_evenement: String,
    pub jours_restants: i64,
    pub description: String,
    pub duree_jours: Option<i64>,
}

/// Document récent pour le dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentDashboardItem {
    pub id_document: i64,
    pub nom_original: String,
    pub nom_type: String,
    pub date_upload: String,
    pub extension: String,
    pub taille_octets: i64,
}

/// Gamme pour le sunburst dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct SunburstGamme {
    pub id_domaine_gamme: i64,
    pub nom_domaine: String,
    pub id_famille_gamme: i64,
    pub nom_famille: String,
    pub id_gamme: i64,
    pub nom_gamme: String,
    pub est_active: i64,
    pub est_reglementaire: i64,
    pub nb_ot_total: i64,
    pub nb_ot_en_retard: i64,
    pub nb_ot_reouvert: i64,
    pub nb_ot_en_cours: i64,
    pub prochaine_date: Option<String>,
    pub jours_periodicite: i64,
}

/// Événement planning (OT dans le calendrier)
#[derive(Debug, Serialize, Deserialize)]
pub struct PlanningEvent {
    pub id_ordre_travail: i64,
    pub id_gamme: i64,
    pub nom_gamme: String,
    pub nom_famille: Option<String>,
    pub date_prevue: String,
    pub date_debut: Option<String>,
    pub date_cloture: Option<String>,
    pub id_statut_ot: i64,
    pub id_priorite: i64,
    pub est_reglementaire: i64,
    pub nom_prestataire: Option<String>,
    pub jours_periodicite: i64,
    pub est_automatique: i64,
    pub nom_domaine: String,
    pub id_famille_gamme: Option<i64>,
}
