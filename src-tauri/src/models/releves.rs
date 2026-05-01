use serde::Serialize;

/// Item de la liste des gammes ayant au moins une opération de type Mesure.
#[derive(Debug, Serialize)]
pub struct RelevesGammeListItem {
    pub id_gamme: i64,
    pub nom_gamme: String,
    pub nom_famille: Option<String>,
    pub nom_domaine: Option<String>,
    pub id_image: Option<i64>,
    pub jours_periodicite: i64,
    pub nb_operations_mesure: i64,
    pub nb_releves_12m: i64,
    pub date_dernier_releve: Option<String>,
}

/// Un point de relevé sur le graphe d'une opération mesure.
#[derive(Debug, Serialize)]
pub struct RelevePoint {
    pub id_ordre_travail: i64,
    pub date_releve: String,
    pub valeur_mesuree: f64,
    pub est_conforme: Option<i64>,
}

/// Métadonnées d'une opération mesure d'une gamme + tous ses relevés (triés ASC).
#[derive(Debug, Serialize)]
pub struct OperationReleves {
    pub id_type_source: i64,
    pub id_source: i64,
    pub nom_operation: String,
    pub unite_symbole: Option<String>,
    pub seuil_minimum: Option<f64>,
    pub seuil_maximum: Option<f64>,
    pub points: Vec<RelevePoint>,
}
