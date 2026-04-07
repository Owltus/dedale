use serde::{Deserialize, Serialize};

// ── Domaines gammes (classification indépendante des équipements) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct DomaineGamme {
    pub id_domaine_gamme: i64,
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DomaineGammeInput {
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

// ── Familles gammes ──

#[derive(Debug, Serialize, Deserialize)]
pub struct FamilleGamme {
    pub id_famille_gamme: i64,
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_domaine_gamme: i64,
    pub id_image: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct FamilleGammeInput {
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_domaine_gamme: i64,
    pub id_image: Option<i64>,
}

/// Version liste enrichie pour affichage en cartes (domaines)
#[derive(Debug, Serialize, Deserialize)]
pub struct DomaineGammeListItem {
    pub id_domaine_gamme: i64,
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub nb_familles: i64,
    pub nb_gammes_inactives: i64,
    pub nb_gammes_total: i64,
    pub nb_ot_en_retard: i64,
    pub nb_ot_reouvert: i64,
    pub nb_ot_en_cours: i64,
    pub nb_ot_sans_ot: i64,
    pub prochaine_date: Option<String>,
    pub jours_periodicite_min: Option<i64>,
}

/// Version liste enrichie pour affichage en cartes (familles)
#[derive(Debug, Serialize, Deserialize)]
pub struct FamilleGammeListItem {
    pub id_famille_gamme: i64,
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub nb_gammes: i64,
    pub nb_gammes_inactives: i64,
    pub nb_ot_en_retard: i64,
    pub nb_ot_reouvert: i64,
    pub nb_ot_en_cours: i64,
    pub nb_ot_sans_ot: i64,
    pub prochaine_date: Option<String>,
    pub jours_periodicite_min: Option<i64>,
}

// ── Gammes (procédures de maintenance) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Gamme {
    pub id_gamme: i64,
    pub nom_gamme: String,
    pub description: Option<String>,
    pub est_reglementaire: i64,
    pub id_periodicite: i64,
    pub id_famille_gamme: i64,
    pub id_prestataire: i64,
    pub id_image: Option<i64>,
    pub id_batiment_calc: Option<i64>,
    pub id_niveau_calc: Option<i64>,
    pub id_local_calc: Option<i64>,
    pub nom_localisation_calc: Option<String>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
    pub est_active: i64,
}

#[derive(Debug, Deserialize)]
pub struct GammeInput {
    pub nom_gamme: String,
    pub description: Option<String>,
    pub est_reglementaire: i64,
    pub id_periodicite: i64,
    pub id_famille_gamme: i64,
    pub id_prestataire: i64,
    pub id_image: Option<i64>,
}

/// Version liste avec noms résolus
#[derive(Debug, Serialize, Deserialize)]
pub struct GammeListItem {
    pub id_gamme: i64,
    pub nom_gamme: String,
    pub est_reglementaire: i64,
    pub est_active: i64,
    pub nom_famille: String,
    pub libelle_periodicite: String,
    pub nom_prestataire: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub nb_documents: i64,
    pub nb_ot_total: i64,
    pub nb_ot_en_retard: i64,
    pub nb_ot_reouvert: i64,
    pub nb_ot_en_cours: i64,
    pub prochaine_date: Option<String>,
    pub jours_periodicite: i64,
}

// ── Opérations spécifiques d'une gamme ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Operation {
    pub id_operation: i64,
    pub nom_operation: String,
    pub description: Option<String>,
    pub id_type_operation: i64,
    pub id_gamme: i64,
    pub seuil_minimum: Option<f64>,
    pub seuil_maximum: Option<f64>,
    pub id_unite: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct OperationInput {
    pub nom_operation: String,
    pub description: Option<String>,
    pub id_type_operation: i64,
    pub id_gamme: i64,
    pub seuil_minimum: Option<f64>,
    pub seuil_maximum: Option<f64>,
    pub id_unite: Option<i64>,
}
