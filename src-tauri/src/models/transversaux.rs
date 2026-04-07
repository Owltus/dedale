use serde::{Deserialize, Serialize};

/// Résultat de recherche globale
#[derive(Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub entity_type: String,
    pub entity_id: i64,
    pub label: String,
    pub sublabel: Option<String>,
    pub route: String,
}

/// Données d'export OT (fiche imprimable)
#[derive(Debug, Serialize, Deserialize)]
pub struct OtExportData {
    pub id_ordre_travail: i64,
    pub nom_gamme: String,
    pub date_prevue: String,
    pub id_statut_ot: i64,
    pub nom_prestataire: Option<String>,
    pub nom_localisation: Option<String>,
    pub nom_famille: Option<String>,
    pub nom_technicien: Option<String>,
    pub commentaires: Option<String>,
}
