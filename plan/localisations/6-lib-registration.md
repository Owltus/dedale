# Étape 6 — lib.rs registration

## Objectif
Enregistrer les ~16 nouvelles commandes et retirer les anciennes.

## Fichier impacté
- `src-tauri/src/lib.rs`

## Travail à réaliser

### Supprimer
```rust
commands::localisations::get_localisations_tree,
commands::localisations::get_localisation,
commands::localisations::create_localisation,
commands::localisations::update_localisation,
commands::localisations::delete_localisation,
```

### Ajouter
```rust
// Bâtiments
commands::localisations::get_batiments,
commands::localisations::get_batiment,
commands::localisations::create_batiment,
commands::localisations::update_batiment,
commands::localisations::delete_batiment,
// Niveaux
commands::localisations::get_niveaux,
commands::localisations::get_niveau,
commands::localisations::create_niveau,
commands::localisations::update_niveau,
commands::localisations::delete_niveau,
// Locaux
commands::localisations::get_locaux,
commands::localisations::get_local,
commands::localisations::create_local,
commands::localisations::update_local,
commands::localisations::delete_local,
// Helper arbre
commands::localisations::get_localisations_tree,
```

## Critère de validation
- `cargo build` compile
- L'app se lance
