use serde::{Deserialize, Serialize};

// ── Bâtiments ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Batiment {
    pub id_batiment: i64,
    pub nom: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
    pub surface_totale: f64,
}

#[derive(Debug, Deserialize)]
pub struct BatimentInput {
    pub nom: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

// ── Niveaux ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Niveau {
    pub id_niveau: i64,
    pub nom: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub id_batiment: i64,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
    pub surface_totale: f64,
}

#[derive(Debug, Deserialize)]
pub struct NiveauInput {
    pub nom: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub id_batiment: i64,
}

// ── Locaux ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Local {
    pub id_local: i64,
    pub nom: String,
    pub description: Option<String>,
    pub surface: Option<f64>,
    pub id_image: Option<i64>,
    pub id_niveau: i64,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LocalInput {
    pub nom: String,
    pub description: Option<String>,
    pub surface: Option<f64>,
    pub id_image: Option<i64>,
    pub id_niveau: i64,
}

// ── Helper pour les dropdowns (arbre aplati) ──

#[derive(Debug, Serialize)]
pub struct LocalisationTreeNode {
    pub id_local: i64,
    pub nom_local: String,
    pub nom_niveau: String,
    pub nom_batiment: String,
    pub label: String,
}

/// Filtrage cascade : IDs autorisés par niveau hiérarchique
#[derive(Debug, Serialize)]
pub struct LocalisationFilter {
    pub locaux: Vec<i64>,
    pub niveaux: Vec<i64>,
    pub batiments: Vec<i64>,
}
