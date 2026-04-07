use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Document {
    pub id_document: i64,
    pub nom_original: String,
    pub hash_sha256: String,
    pub nom_fichier: String,
    pub taille_octets: i64,
    pub id_type_document: i64,
    pub date_upload: Option<String>,
}

/// Version liste avec nombre de liaisons
#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentListItem {
    pub id_document: i64,
    pub nom_original: String,
    pub taille_octets: i64,
    pub id_type_document: i64,
    pub nom_type: String,
    pub date_upload: Option<String>,
    pub nb_liaisons: i64,
}

/// Document lié à une entité (utilisé dans le composant DocumentsLies)
#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentLie {
    pub id_document: i64,
    pub nom_original: String,
    pub taille_octets: i64,
    pub nom_type: String,
    pub date_upload: Option<String>,
    pub date_liaison: Option<String>,
    pub commentaire: Option<String>,
    /// Source du document : null = direct, "Gamme : X" ou "OT : Y" = hérité
    pub source: Option<String>,
}

/// Document agrégé avec source (pour vue prestataire)
#[derive(Debug, Serialize, Deserialize)]
pub struct DocumentAggrege {
    pub id_document: i64,
    pub nom_original: String,
    pub taille_octets: i64,
    pub nom_type: String,
    pub date_upload: Option<String>,
    pub source: String,
}

#[derive(Debug, Deserialize)]
pub struct DocumentUploadInput {
    pub nom_original: String,
    /// Données du fichier en base64
    pub data_base64: String,
    pub id_type_document: i64,
}
