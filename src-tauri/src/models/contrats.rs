use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Contrat {
    pub id_contrat: i64,
    pub id_prestataire: i64,
    pub id_type_contrat: i64,
    pub id_contrat_parent: Option<i64>,
    pub est_archive: i64,
    pub objet_avenant: Option<String>,
    pub reference: String,
    pub date_signature: Option<String>,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub date_resiliation: Option<String>,
    pub date_notification: Option<String>,
    pub duree_cycle_mois: Option<i64>,
    pub delai_preavis_jours: Option<i64>,
    pub fenetre_resiliation_jours: Option<i64>,
    pub commentaires: Option<String>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
    /// Statut calculé en Rust (pas stocké en DB)
    pub statut: String,
}

/// Version enrichie pour les listes (cartes détaillées)
#[derive(Debug, Serialize, Deserialize)]
pub struct ContratListItem {
    pub id_contrat: i64,
    pub id_prestataire: i64,
    pub nom_prestataire: String,
    pub id_type_contrat: i64,
    pub libelle_type: String,
    pub est_archive: i64,
    pub reference: String,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub date_resiliation: Option<String>,
    pub date_signature: Option<String>,
    pub duree_cycle_mois: Option<i64>,
    pub delai_preavis_jours: Option<i64>,
    pub fenetre_resiliation_jours: Option<i64>,
    pub commentaires: Option<String>,
    pub objet_avenant: Option<String>,
    pub date_notification: Option<String>,
    pub nb_avenants: i64,
    pub statut: String,
}

/// Version pour la chaîne de versions
#[derive(Debug, Serialize, Deserialize)]
pub struct ContratVersion {
    pub id_contrat: i64,
    pub id_contrat_parent: Option<i64>,
    pub est_archive: i64,
    pub objet_avenant: Option<String>,
    pub reference: String,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub date_creation: Option<String>,
    pub statut: String,
}

#[derive(Debug, Deserialize)]
pub struct ContratInput {
    pub id_prestataire: i64,
    pub id_type_contrat: i64,
    pub reference: String,
    pub date_signature: Option<String>,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub duree_cycle_mois: Option<i64>,
    pub delai_preavis_jours: Option<i64>,
    pub fenetre_resiliation_jours: Option<i64>,
    pub commentaires: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AvenantInput {
    pub id_contrat_parent: i64,
    pub objet_avenant: String,
    pub id_prestataire: i64,
    pub id_type_contrat: i64,
    pub reference: String,
    pub date_signature: Option<String>,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub duree_cycle_mois: Option<i64>,
    pub delai_preavis_jours: Option<i64>,
    pub fenetre_resiliation_jours: Option<i64>,
    pub commentaires: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResiliationInput {
    pub date_notification: String,
    pub date_resiliation: String,
}
