use serde::{Deserialize, Serialize};

// ── Ordre de travail (table avec 24+ colonnes dont snapshots figés) ──

#[derive(Debug, Serialize, Deserialize)]
pub struct OrdreTravail {
    pub id_ordre_travail: i64,
    // Snapshots descriptifs (figés à la création)
    pub nom_gamme: String,
    pub description_gamme: Option<String>,
    pub est_reglementaire: i64,
    pub nom_localisation: Option<String>,
    pub nom_famille: Option<String>,
    pub nom_prestataire: Option<String>,
    // Références vivantes
    pub id_gamme: i64,
    pub id_prestataire: i64,
    pub id_statut_ot: i64,
    pub id_priorite: i64,
    // Snapshots périodicité
    pub libelle_periodicite: String,
    pub jours_periodicite: i64,
    pub periodicite_jours_valides: i64,
    // Image
    pub id_image: Option<i64>,
    // Dates métier
    pub date_prevue: String,
    pub est_automatique: i64,
    pub date_debut: Option<String>,
    pub date_cloture: Option<String>,
    pub commentaires: Option<String>,
    // Liaisons optionnelles
    pub id_di: Option<i64>,
    pub id_technicien: Option<i64>,
    pub nom_technicien: Option<String>,
    pub nom_poste: Option<String>,
    pub nom_equipement: Option<String>,
    // Dates techniques
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
}

/// Version liste avec progression calculée et retard
#[derive(Debug, Serialize, Deserialize)]
pub struct OtListItem {
    pub id_ordre_travail: i64,
    pub nom_gamme: String,
    pub description_gamme: Option<String>,
    pub date_prevue: String,
    pub date_cloture: Option<String>,
    pub id_statut_ot: i64,
    pub id_priorite: i64,
    pub nom_prestataire: Option<String>,
    pub est_reglementaire: i64,
    pub nom_localisation: Option<String>,
    pub est_automatique: i64,
    pub jours_periodicite: i64,
    pub id_image: Option<i64>,
    pub progression: f64,
    pub est_en_retard: i64,
    pub nb_documents: i64,
}

/// Opération d'exécution (inline dans l'OT)
#[derive(Debug, Serialize, Deserialize)]
pub struct OperationExecution {
    pub id_operation_execution: i64,
    pub id_ordre_travail: i64,
    pub id_type_source: i64,
    pub id_source: i64,
    pub nom_operation: String,
    pub description_operation: Option<String>,
    pub type_operation: String,
    pub seuil_minimum: Option<f64>,
    pub seuil_maximum: Option<f64>,
    pub unite_nom: Option<String>,
    pub unite_symbole: Option<String>,
    pub id_statut_operation: i64,
    pub valeur_mesuree: Option<f64>,
    pub est_conforme: Option<i64>,
    pub date_execution: Option<String>,
    pub commentaires: Option<String>,
}

/// Input pour la création d'un OT (le trigger creation_ot_complet fait le reste)
#[derive(Debug, Deserialize)]
pub struct OtCreateInput {
    pub id_gamme: i64,
    pub date_prevue: String,
    pub id_priorite: i64,
    pub id_technicien: Option<i64>,
    pub id_di: Option<i64>,
    pub commentaires: Option<String>,
}

/// Input pour modifier les champs éditables d'un OT actif
#[derive(Debug, Deserialize)]
pub struct OtUpdateInput {
    pub date_prevue: Option<String>,
    pub id_priorite: Option<i64>,
    pub id_technicien: Option<i64>,
    pub commentaires: Option<String>,
}

/// Input pour mettre à jour une opération d'exécution
#[derive(Debug, Deserialize)]
pub struct OpExecUpdateInput {
    pub id_statut_operation: i64,
    pub valeur_mesuree: Option<f64>,
    pub est_conforme: Option<i64>,
    pub date_execution: Option<String>,
    pub commentaires: Option<String>,
}

/// OT suivant (pour warning réouverture)
#[derive(Debug, Serialize, Deserialize)]
pub struct OtSuivant {
    pub id_ordre_travail: i64,
    pub date_prevue: String,
}

/// Détail complet d'un OT (OT + opérations + OT suivant)
#[derive(Debug, Serialize, Deserialize)]
pub struct OrdreDetailComplet {
    pub ordre_travail: OrdreTravail,
    pub operations: Vec<OperationExecution>,
    pub ot_suivant: Option<OtSuivant>,
}
