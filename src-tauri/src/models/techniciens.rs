use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Technicien {
    pub id_technicien: i64,
    pub nom: String,
    pub prenom: String,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub id_poste: Option<i64>,
    pub est_actif: i64,
    pub id_image: Option<i64>,
    pub date_creation: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TechnicienInput {
    pub nom: String,
    pub prenom: String,
    pub telephone: Option<String>,
    pub email: Option<String>,
    pub id_poste: Option<i64>,
    pub est_actif: i64,
    pub id_image: Option<i64>,
}
