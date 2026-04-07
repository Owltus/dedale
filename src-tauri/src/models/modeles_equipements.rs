use serde::{Deserialize, Serialize};

// ── Catégorie de modèles ──

#[derive(Debug, Serialize)]
pub struct CategorieModele {
    pub id_categorie: i64,
    pub nom_categorie: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CategorieModeleInput {
    pub nom_categorie: String,
    pub description: Option<String>,
}

// ── Modèle d'équipement ──

#[derive(Debug, Serialize)]
pub struct ModeleEquipement {
    pub id_modele_equipement: i64,
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_categorie: Option<i64>,
    pub nom_categorie: Option<String>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
    pub nb_champs: i64,
    pub nb_familles: i64,
}

#[derive(Debug, Deserialize)]
pub struct ModeleEquipementInput {
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_categorie: Option<i64>,
}

// ── Champ d'un modèle ──

#[derive(Debug, Serialize)]
pub struct ChampModele {
    pub id_champ: i64,
    pub id_modele_equipement: i64,
    pub nom_champ: String,
    pub type_champ: String,
    pub unite: Option<String>,
    pub est_obligatoire: i64,
    pub ordre: i64,
    pub valeurs_possibles: Option<String>,
    pub valeur_defaut: Option<String>,
    pub est_archive: i64,
}

#[derive(Debug, Deserialize)]
pub struct ChampModeleInput {
    pub id_modele_equipement: i64,
    pub nom_champ: String,
    pub type_champ: String,
    pub unite: Option<String>,
    pub est_obligatoire: i64,
    pub ordre: i64,
    pub valeurs_possibles: Option<String>,
    pub valeur_defaut: Option<String>,
}

// ── Valeur d'un champ pour un équipement ──

/// Valeur enrichie : champ + valeur courante (pour affichage et édition)
#[derive(Debug, Serialize)]
pub struct ValeurChampEquipement {
    pub id_champ: i64,
    pub nom_champ: String,
    pub type_champ: String,
    pub unite: Option<String>,
    pub est_obligatoire: i64,
    pub ordre: i64,
    pub valeurs_possibles: Option<String>,
    pub valeur_defaut: Option<String>,
    pub est_archive: i64,
    pub valeur: Option<String>,
}

/// Payload pour sauvegarder une valeur
#[derive(Debug, Deserialize)]
pub struct ValeurEquipementInput {
    pub id_champ: i64,
    pub valeur: Option<String>,
}
