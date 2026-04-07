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

/// Données complètes du dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct DashboardData {
    // KPIs
    pub nb_ot_en_retard: i64,
    pub nb_ot_cette_semaine: i64,
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
    // Onboarding
    pub has_etablissement: bool,
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
}

/// DI simplifiée pour le dashboard
#[derive(Debug, Serialize, Deserialize)]
pub struct DiDashboardItem {
    pub id_di: i64,
    pub libelle_constat: String,
    pub date_constat: String,
    pub id_statut_di: i64,
}

/// Événement planning (OT dans le calendrier)
#[derive(Debug, Serialize, Deserialize)]
pub struct PlanningEvent {
    pub id_ordre_travail: i64,
    pub id_gamme: i64,
    pub nom_gamme: String,
    pub nom_famille: Option<String>,
    pub date_prevue: String,
    pub id_statut_ot: i64,
    pub id_priorite: i64,
    pub est_reglementaire: i64,
    pub nom_prestataire: Option<String>,
}
