use serde::{Deserialize, Serialize};

// ── Unités de mesure ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Unite {
    pub id_unite: i64,
    pub nom: String,
    pub symbole: String,
    pub description: Option<String>,
}

// ── Périodicités ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Periodicite {
    pub id_periodicite: i64,
    pub libelle: String,
    pub description: Option<String>,
    pub jours_periodicite: i64,
    pub jours_valide: i64,
    pub tolerance_jours: i64,
}

// ── Types d'opérations ──

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeOperation {
    pub id_type_operation: i64,
    pub libelle: String,
    pub description: Option<String>,
    pub necessite_seuils: i64,
}

// ── Types de documents ──

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeDocument {
    pub id_type_document: i64,
    pub nom: String,
    pub description: String,
    pub est_systeme: i64,
}

// ── Types de contrats ──

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeContrat {
    pub id_type_contrat: i64,
    pub libelle: String,
    pub description: Option<String>,
}

// ── Postes ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Poste {
    pub id_poste: i64,
    pub libelle: String,
    pub description: String,
}

// ── Types ERP (lecture seule) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct TypeErp {
    pub id_type_erp: i64,
    pub code: String,
    pub libelle: String,
    pub description: Option<String>,
}

// ── Catégories ERP (lecture seule) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct CategorieErp {
    pub id_categorie_erp: i64,
    pub libelle: String,
    pub description: Option<String>,
}

// ── Établissement (fiche unique) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct Etablissement {
    pub id_etablissement: i64,
    pub nom: String,
    pub id_type_erp: Option<i64>,
    pub id_categorie_erp: Option<i64>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct EtablissementInput {
    pub nom: String,
    pub id_type_erp: Option<i64>,
    pub id_categorie_erp: Option<i64>,
    pub adresse: Option<String>,
    pub code_postal: Option<String>,
    pub ville: Option<String>,
}

// ── Statuts OT (lecture seule) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct StatutOt {
    pub id_statut_ot: i64,
    pub nom_statut: String,
    pub description: Option<String>,
}

// ── Statuts DI (lecture seule) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct StatutDi {
    pub id_statut_di: i64,
    pub nom_statut: String,
    pub description: Option<String>,
}

// ── Priorités OT (lecture seule) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct PrioriteOt {
    pub id_priorite: i64,
    pub nom_priorite: String,
    pub niveau: i64,
    pub description: Option<String>,
}

// ── Modèles de DI ──

#[derive(Debug, Serialize, Deserialize)]
pub struct ModeleDi {
    pub id_modele_di: i64,
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_famille: Option<i64>,
    pub id_equipement: Option<i64>,
    pub libelle_constat: String,
    pub description_constat: String,
    pub description_resolution: Option<String>,
    pub date_creation: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ModeleDiDetail {
    pub id_modele_di: i64,
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_famille: Option<i64>,
    pub nom_famille: Option<String>,
    pub id_equipement: Option<i64>,
    pub nom_equipement: Option<String>,
    pub libelle_constat: String,
    pub description_constat: String,
    pub description_resolution: Option<String>,
    pub date_creation: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ModeleDiInput {
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_famille: Option<i64>,
    pub id_equipement: Option<i64>,
    pub libelle_constat: String,
    pub description_constat: String,
    pub description_resolution: Option<String>,
}
