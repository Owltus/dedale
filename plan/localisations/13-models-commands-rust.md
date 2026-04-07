# Étape 13 — Models + Commands Rust

## Objectif
Adapter les structs et commandes Rust pour refléter la suppression de `id_local` et l'ajout des colonnes calculées.

## Fichiers impactés
- `src-tauri/src/models/gammes.rs`
- `src-tauri/src/commands/gammes.rs`

## Travail à réaliser

### models/gammes.rs

**Struct `Gamme` :**
- Supprimer `pub id_local: Option<i64>`
- Ajouter :
  ```rust
  pub id_batiment_calc: Option<i64>,
  pub id_niveau_calc: Option<i64>,
  pub id_local_calc: Option<i64>,
  pub nom_localisation_calc: Option<String>,
  ```

**Struct `GammeInput` :**
- Supprimer `pub id_local: Option<i64>`
- Ne PAS ajouter les colonnes calc (elles sont calculées par trigger, pas saisies)

### commands/gammes.rs

**`GAMME_COLS`** :
- Supprimer `id_local`
- Ajouter `id_batiment_calc, id_niveau_calc, id_local_calc, nom_localisation_calc`

**`row_to_gamme`** :
- Mettre à jour les index de colonnes

**`create_gamme` / `update_gamme`** :
- Supprimer `id_local` de l'INSERT/UPDATE
- Les colonnes calc ne sont PAS dans l'INSERT/UPDATE (le trigger sur gammes_equipements s'en charge)

**Note :** Après un `link_gamme_equipement` ou `unlink_gamme_equipement`, le trigger recalcule automatiquement. Le frontend doit refetcher la gamme pour voir le nouveau `nom_localisation_calc`.

## Critère de validation
- `cargo build` compile
- Les commandes gammes n'envoient plus `id_local`
