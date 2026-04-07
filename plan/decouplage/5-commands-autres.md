# Étape 5 — Commandes Rust : fichiers secondaires

## Objectif
Mettre à jour toutes les commandes Rust qui référencent l'ancien schéma (domaines_techniques, gammes.id_famille, gammes.id_equipement).

## Fichiers impactés
- `src-tauri/src/commands/equipements.rs`
- `src-tauri/src/commands/ordres_travail.rs`
- `src-tauri/src/commands/export.rs`
- `src-tauri/src/commands/recherche.rs`
- `src-tauri/src/commands/dashboard.rs`

## Travail à réaliser

### 1. `commands/equipements.rs`

**Renommage table :**
- Toutes les requêtes SQL referençant `domaines_techniques` → `domaines_equipements`
- Concerne : `get_domaines`, `get_domaine`, `create_domaine`, `update_domaine`, `delete_domaine`

**`get_ot_by_equipement(id_equipement)` :**
- Avant : `JOIN gammes g ON ot.id_gamme = g.id_gamme WHERE g.id_equipement = ?1`
- Après : `JOIN gammes_equipements ge ON ot.id_gamme = ge.id_gamme WHERE ge.id_equipement = ?1`
- (Plus besoin de joindre la table gammes pour ce filtre)

### 2. `commands/ordres_travail.rs`

**`get_ot_by_famille(id_famille)` :**
- Avant : `JOIN gammes g ON ot.id_gamme = g.id_gamme WHERE g.id_famille = ?1`
- Après : `JOIN gammes g ON ot.id_gamme = g.id_gamme WHERE g.id_famille_gamme = ?1`
- Renommer le paramètre en `id_famille_gamme`

### 3. `commands/export.rs`

**`export_csv_gammes` :**
- Avant : `JOIN familles_equipements fe ON g.id_famille = fe.id_famille`
- Après : `JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme`
- Remplacer `fe.nom_famille` → `fg.nom_famille`

**`get_export_ot` :**
- Inchangé (lit `nom_famille` directement depuis `ordres_travail` — c'est un snapshot)

### 4. `commands/recherche.rs`

**`recherche_globale` :**
- Sous-requête gammes : `(SELECT nom_famille FROM familles_equipements WHERE id_famille = g.id_famille)` → `(SELECT nom_famille FROM familles_gammes WHERE id_famille_gamme = g.id_famille_gamme)`

### 5. `commands/dashboard.rs`

**Alerte gammes réglementaires sans OT :**
- Avant : `JOIN familles_equipements fe ON g.id_famille = fe.id_famille`
- Après : `JOIN familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme`
- Remplacer `fe.nom_famille` → `fg.nom_famille`

## Critère de validation
- `cargo build` compile sans erreur (toutes les commandes alignées)
- Aucune référence à `domaines_techniques`, `gammes.id_famille`, `gammes.id_equipement` dans les fichiers commands/

## Contrôle /borg
Lancer un /borg pour vérifier :
- Grep exhaustif : plus aucune occurrence de `domaines_techniques`, `g.id_famille ` (avec espace), `g.id_equipement` dans src-tauri/src/
- Cohérence des JOINs SQL
