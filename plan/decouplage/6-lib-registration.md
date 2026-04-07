# Étape 6 — Enregistrement commandes (lib.rs)

## Objectif
Enregistrer les ~14 nouvelles commandes Tauri dans `generate_handler![]` et les capabilities JSON.

## Fichiers impactés
- `src-tauri/src/lib.rs`
- `src-tauri/tauri.conf.json` ou capabilities JSON (si applicable)

## Travail à réaliser

### 1. Ajouter dans `generate_handler![]`

```rust
// Domaines gammes
commands::gammes::get_domaines_gammes,
commands::gammes::get_domaine_gamme,
commands::gammes::create_domaine_gamme,
commands::gammes::update_domaine_gamme,
commands::gammes::delete_domaine_gamme,

// Familles gammes
commands::gammes::get_familles_gammes,
commands::gammes::get_famille_gamme,
commands::gammes::create_famille_gamme,
commands::gammes::update_famille_gamme,
commands::gammes::delete_famille_gamme,

// Liaison gammes ↔ équipements
commands::gammes::get_gamme_equipements,
commands::gammes::link_gamme_equipement,
commands::gammes::unlink_gamme_equipement,
commands::gammes::get_equipement_gammes,
```

### 2. Vérifier le renommage `get_ot_by_famille`
- Si le nom de commande a changé (→ `get_ot_by_famille_gamme`), mettre à jour dans `generate_handler![]`

### 3. Capabilities Tauri v2
- Vérifier que les nouvelles commandes sont autorisées dans les capabilities JSON

## Critère de validation
- `cargo build` compile sans erreur ni warning
- L'app se lance avec `npm run tauri dev`

## Contrôle /borg
Lancer un /borg pour vérifier :
- Chaque commande `#[tauri::command]` est bien enregistrée dans `generate_handler![]`
- Pas de commande orpheline (déclarée mais non enregistrée, ou inverse)
- `cargo build` passe
