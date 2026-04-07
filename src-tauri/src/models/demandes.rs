use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct DemandeIntervention {
    pub id_di: i64,
    pub id_statut_di: i64,
    pub libelle_constat: String,
    pub description_constat: String,
    pub date_constat: String,
    pub description_resolution: Option<String>,
    pub date_resolution: Option<String>,
    pub description_resolution_suggeree: Option<String>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
}

/// Version liste
#[derive(Debug, Serialize, Deserialize)]
pub struct DiListItem {
    pub id_di: i64,
    pub id_statut_di: i64,
    pub libelle_constat: String,
    pub date_constat: String,
    pub date_resolution: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DiCreateInput {
    pub libelle_constat: String,
    pub description_constat: String,
    pub date_constat: Option<String>,
    pub description_resolution_suggeree: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DiUpdateInput {
    pub libelle_constat: Option<String>,
    pub description_constat: Option<String>,
    pub date_constat: Option<String>,
    pub description_resolution_suggeree: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct DiResolutionInput {
    pub date_resolution: String,
    pub description_resolution: String,
}

/// Équipement lié à une DI — avec nom et localisation résolue
#[derive(Debug, Serialize)]
pub struct DiEquipementInfo {
    pub id_equipement: i64,
    pub nom_affichage: String,
    pub localisation_label: Option<String>,
}
