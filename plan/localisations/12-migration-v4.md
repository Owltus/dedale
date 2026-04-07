# Étape 12 — Migration db.rs (v3→v4)

## Objectif
Migrer les bases existantes : supprimer `id_local` de gammes, ajouter les 4 colonnes calculées, recalculer toutes les gammes.

## Fichier impacté
- `src-tauri/src/db.rs`

## Travail à réaliser

### 1. Détection version
```rust
// PRAGMA user_version = 3 → v3 (localisations structurées)
// PRAGMA user_version = 4 → v4 (localisation héritée)
```

### 2. Script de migration

1. `PRAGMA foreign_keys = OFF`
2. Recréer table `gammes` sans `id_local`, avec 4 colonnes calc + FK
3. Copier données (id_local → ignoré, colonnes calc = NULL pour l'instant)
4. Recalculer `nom_localisation_calc` pour chaque gamme qui a des équipements liés :
   ```sql
   UPDATE gammes SET
       id_batiment_calc = ...,
       id_niveau_calc = ...,
       id_local_calc = ...,
       nom_localisation_calc = ...
   WHERE id_gamme IN (SELECT DISTINCT id_gamme FROM gammes_equipements);
   ```
5. Recréer index
6. `PRAGMA foreign_key_check`
7. `PRAGMA user_version = 4`
8. `PRAGMA foreign_keys = ON`

### Points d'attention
- Les gammes sans équipements gardent toutes les colonnes calc à NULL (orphelines)
- Les OT existants ne sont PAS modifiés (snapshots historiques conservés)
- Idempotent (relancer ne casse pas)

## Critère de validation
- `cargo build` compile
- Base v3 migrée automatiquement
- Base vide créée directement en v4
