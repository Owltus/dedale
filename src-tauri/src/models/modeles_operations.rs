use serde::{Deserialize, Serialize};

// ── Modèles d'opérations (templates réutilisables) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ModeleOperation {
    pub id_modele_operation: i64,
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub date_creation: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ModeleOperationInput {
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

// ── Items d'un modèle d'opération ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ModeleOperationItem {
    pub id_modele_operation_item: i64,
    pub nom_operation: String,
    pub description: Option<String>,
    pub id_type_operation: i64,
    pub id_modele_operation: i64,
    pub seuil_minimum: Option<f64>,
    pub seuil_maximum: Option<f64>,
    pub id_unite: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ModeleOperationItemInput {
    pub nom_operation: String,
    pub description: Option<String>,
    pub id_type_operation: i64,
    pub id_modele_operation: i64,
    pub seuil_minimum: Option<f64>,
    pub seuil_maximum: Option<f64>,
    pub id_unite: Option<i64>,
}
