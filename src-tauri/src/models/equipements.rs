use serde::{Deserialize, Serialize};

// ── Domaines techniques ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Domaine {
    pub id_domaine: i64,
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DomaineInput {
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

/// Version liste enrichie pour affichage en cartes (domaines équipements)
#[derive(Debug, Serialize, Deserialize)]
pub struct DomaineEquipListItem {
    pub id_domaine: i64,
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub nb_familles: i64,
    pub nb_equipements_inactifs: i64,
    pub nb_equipements_total: i64,
    pub nb_ot_en_retard: i64,
    pub nb_ot_reouvert: i64,
    pub nb_ot_en_cours: i64,
    pub prochaine_date: Option<String>,
    pub jours_periodicite_min: Option<i64>,
}

// ── Familles d'équipements ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Famille {
    pub id_famille: i64,
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_domaine: i64,
    pub id_image: Option<i64>,
    pub id_modele_equipement: i64,
}

#[derive(Debug, Deserialize)]
pub struct FamilleInput {
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_domaine: i64,
    pub id_image: Option<i64>,
    pub id_modele_equipement: i64,
}

/// Version liste enrichie pour affichage en cartes (familles équipements)
#[derive(Debug, Serialize, Deserialize)]
pub struct FamilleEquipListItem {
    pub id_famille: i64,
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
    pub nom_modele: Option<String>,
    pub nb_equipements: i64,
    pub nb_equipements_inactifs: i64,
    pub nb_ot_en_retard: i64,
    pub nb_ot_reouvert: i64,
    pub nb_ot_en_cours: i64,
    pub prochaine_date: Option<String>,
    pub jours_periodicite_min: Option<i64>,
}

/// Version liste enrichie pour affichage en cartes (équipements)
#[derive(Debug, Serialize, Deserialize)]
pub struct EquipementListItem {
    pub id_equipement: i64,
    pub nom_affichage: String,
    pub description: Option<String>,
    pub est_actif: i64,
    pub id_image: Option<i64>,
    pub nb_ot_en_retard: i64,
    pub nb_ot_reouvert: i64,
    pub nb_ot_en_cours: i64,
    pub prochaine_date: Option<String>,
    pub jours_periodicite_min: Option<i64>,
}

/// Item léger pour les Select dropdown (id + nom)
#[derive(Debug, Serialize)]
pub struct EquipementSelectItem {
    pub id_equipement: i64,
    pub nom_affichage: String,
}

// ── Équipements ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Equipement {
    pub id_equipement: i64,
    pub nom_affichage: String,
    pub date_mise_en_service: Option<String>,
    pub date_fin_garantie: Option<String>,
    pub id_famille: i64,
    pub id_local: Option<i64>,
    pub est_actif: i64,
    pub commentaires: Option<String>,
    pub id_image: Option<i64>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EquipementInput {
    pub nom_affichage: String,
    pub date_mise_en_service: Option<String>,
    pub date_fin_garantie: Option<String>,
    pub id_famille: i64,
    pub id_local: Option<i64>,
    pub est_actif: i64,
    pub commentaires: Option<String>,
    pub id_image: Option<i64>,
}
