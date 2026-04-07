# Étape 3 — Models Rust

## Objectif
Remplacer les structs `Localisation`, `LocalisationNode`, `LocalisationInput` par 3 jeux de structs.

## Fichier impacté
- `src-tauri/src/models/localisations.rs`

## Travail à réaliser

### Supprimer
- `Localisation`, `LocalisationNode`, `LocalisationInput`

### Créer
```rust
// Bâtiments
pub struct Batiment { id_batiment, nom, description, date_creation, date_modification }
pub struct BatimentInput { nom, description }

// Niveaux
pub struct Niveau { id_niveau, nom, description, id_batiment, date_creation, date_modification }
pub struct NiveauInput { nom, description, id_batiment }

// Locaux
pub struct Local { id_local, nom, description, id_niveau, date_creation, date_modification }
pub struct LocalInput { nom, description, id_niveau }

// Helper pour les selects (arbre aplati pour les dropdowns)
pub struct LocalisationTreeNode {
    pub id_local: i64,
    pub nom_local: String,
    pub nom_niveau: String,
    pub nom_batiment: String,
    pub label: String, // "Bâtiment A > RDC > Cuisine"
}
```

### Modifier dans d'autres models
- `models/gammes.rs` : `id_localisation` → `id_local`
- `models/equipements.rs` : `id_localisation` → `id_local`

## Critère de validation
- `cargo build` (erreurs attendues dans commands/ → étape 4)
