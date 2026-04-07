use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Image {
    pub id_image: i64,
    pub nom: String,
    pub description: Option<String>,
    /// Données encodées en base64 pour le transport JSON
    pub image_data_base64: String,
    pub image_mime: String,
    pub taille_octets: i64,
    pub date_creation: Option<String>,
}

/// Image enrichie avec les noms des entités qui l'utilisent
#[derive(Debug, Serialize, Deserialize)]
pub struct ImageLibraryItem {
    pub id_image: i64,
    pub nom: String,
    pub description: Option<String>,
    pub image_data_base64: String,
    pub image_mime: String,
    pub taille_octets: i64,
    pub date_creation: Option<String>,
    pub usages: String,
}

#[derive(Debug, Deserialize)]
pub struct ImageInput {
    pub nom: String,
    pub description: Option<String>,
    pub image_data_base64: String,
    pub image_mime: String,
}
