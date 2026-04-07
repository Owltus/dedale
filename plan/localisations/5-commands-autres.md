# Étape 5 — Commands secondaires

## Objectif
Mettre à jour toutes les commandes qui référencent `id_localisation`.

## Fichiers impactés
- `src-tauri/src/commands/gammes.rs`
- `src-tauri/src/commands/equipements.rs`
- `src-tauri/src/commands/ordres_travail.rs`
- `src-tauri/src/commands/demandes.rs`
- `src-tauri/src/commands/documents.rs`
- `src-tauri/src/commands/recherche.rs`
- `src-tauri/src/commands/dashboard.rs`

## Travail par fichier

### gammes.rs
- `GAMME_COLS` : `id_localisation` → `id_local`
- `row_to_gamme` : champ `id_localisation` → `id_local`
- `create_gamme`, `update_gamme` : colonne SQL `id_localisation` → `id_local`

### equipements.rs
- `EQUIPEMENT_COLUMNS` : `id_localisation` → `id_local`
- `row_to_equipement` : champ `id_localisation` → `id_local`
- `create_equipement`, `update_equipement` : colonne SQL

### ordres_travail.rs
- Le snapshot `nom_localisation` est déjà un TEXT dans ordres_travail → inchangé
- Vérifier que le trigger `creation_ot_complet` calcule le chemin complet

### demandes.rs
- `get_di_localisations` : table `di_localisations`, colonne `id_localisation` → `id_local`
- `link_di_localisation`, `unlink_di_localisation` : idem

### documents.rs
- `link_document_localisation`, `unlink_document_localisation` : colonne `id_localisation` → `id_local`
- Mapping entity type "localisations" → table `documents_localisations` avec `id_local`

### recherche.rs
- Remplacer la requête `SELECT ... FROM localisations` par 3 UNION :
  ```sql
  SELECT 'Bâtiment', id_batiment, nom, description FROM batiments WHERE nom LIKE ?1
  UNION ALL
  SELECT 'Niveau', id_niveau, nom, description FROM niveaux WHERE nom LIKE ?1
  UNION ALL
  SELECT 'Local', id_local, nom, description FROM locaux WHERE nom LIKE ?1
  ```

### dashboard.rs
- `COUNT(*) FROM localisations` → `COUNT(*) FROM batiments`

## Critère de validation
- `cargo build` compile sans erreur
- Aucune référence à `localisations` dans src-tauri/src/ (sauf commentaires)
