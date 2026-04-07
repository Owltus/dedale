# Étape 3 — Modèles Rust (structs)

## Objectif
Mettre à jour les structs Rust pour refléter le nouveau schéma.

## Fichiers impactés
- `src-tauri/src/models/gammes.rs`
- `src-tauri/src/models/dashboard.rs` (vérification)

## Travail à réaliser

### 1. Modifier `models/gammes.rs`

**Struct `Gamme` :**
- Remplacer `pub id_famille: i64` → `pub id_famille_gamme: i64`
- Supprimer `pub id_equipement: Option<i64>`

**Struct `GammeInput` :**
- Remplacer `pub id_famille: i64` → `pub id_famille_gamme: i64`
- Supprimer `pub id_equipement: Option<i64>`

**Struct `GammeListItem` :**
- `pub nom_famille: String` — inchangé (string résolu, pas un ID)

**Nouvelles structs à ajouter :**
```rust
#[derive(Debug, Serialize)]
pub struct DomaineGamme {
    pub id_domaine_gamme: i64,
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct DomaineGammeInput {
    pub nom_domaine: String,
    pub description: Option<String>,
    pub id_image: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct FamilleGamme {
    pub id_famille_gamme: i64,
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_domaine_gamme: i64,
    pub id_image: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct FamilleGammeInput {
    pub nom_famille: String,
    pub description: Option<String>,
    pub id_domaine_gamme: i64,
    pub id_image: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct GammeEquipementLink {
    pub id_gamme_equipement: i64,
    pub id_gamme: i64,
    pub id_equipement: i64,
    pub date_liaison: Option<String>,
}
```

### 2. Vérifier `models/dashboard.rs`
- `GammeAlerte.nom_famille: String` — inchangé (c'est un string résolu)
- Aucune modification nécessaire

## Critère de validation
- `cargo build` compile sans erreur (attendu : erreurs dans commands/ car les requêtes SQL ne matchent plus → normal, corrigé à l'étape 4)
- Les structs reflètent exactement les colonnes du nouveau schéma

## Contrôle /borg
Lancer un /borg pour vérifier :
- Cohérence structs ↔ schéma SQL
- Pas de champ orphelin ou manquant
