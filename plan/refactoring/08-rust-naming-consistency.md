# Phase 8 — Standardiser nommage constantes SQL

## Contexte

Les constantes SQL pour les listes de colonnes SELECT ont des noms incohérents :

| Fichier | Nom actuel | Standard proposé |
|---------|-----------|------------------|
| `referentiels.rs` | `MODELE_DI_SELECT` | `MODELE_DI_COLS` |
| `images.rs` | `IMAGE_COLS` | `IMAGE_COLS` (OK) |
| `localisations.rs` | `BATIMENT_COLS`, `NIVEAU_COLS`, `LOCAL_COLS` | OK |
| `equipements.rs` | `EQUIPEMENT_COLUMNS` | `EQUIPEMENT_COLS` |
| `techniciens.rs` | `COLS` | `TECHNICIEN_COLS` |

## Convention

Toutes les constantes de colonnes SELECT suivent le pattern : `{TABLE}_COLS`

## Ordre d'exécution

1. `referentiels.rs` : renommer `MODELE_DI_SELECT` → `MODELE_DI_COLS`
2. `equipements.rs` : renommer `EQUIPEMENT_COLUMNS` → `EQUIPEMENT_COLS`
3. `techniciens.rs` : renommer `COLS` → `TECHNICIEN_COLS`
4. `cargo check` — 0 erreur

## Fichiers impactés

| Couche | Fichiers | Action |
|--------|----------|--------|
| Rust commands | `referentiels.rs` | Renommer 1 constante |
| Rust commands | `equipements.rs` | Renommer 1 constante |
| Rust commands | `techniciens.rs` | Renommer 1 constante |
| **Total** | **3 fichiers** | Modifiés |

## Vérification

1. **Compilation** : `cargo check` sans erreur
