use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Prestataire {
    pub id_prestataire: i64,
    pub libelle: String,
    pub description: Option<String>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub id_image: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PrestataireInput {
    pub libelle: String,
    pub description: Option<String>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub id_image: Option<i64>,
}
