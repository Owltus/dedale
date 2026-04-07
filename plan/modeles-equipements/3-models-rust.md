# Etape 3 — Modeles Rust (structs)

## Objectif
Creer les structs Rust pour les modeles d'equipement, leurs champs et les valeurs. Modifier la struct `Famille` pour inclure le modele.

## Fichiers impactes
- `src-tauri/src/models/modeles_equipements.rs` (NOUVEAU)
- `src-tauri/src/models/equipements.rs` (modifie)
- `src-tauri/src/models/mod.rs` (modifie)

## Travail a realiser

### 3.1 Nouveau fichier `models/modeles_equipements.rs`

```rust
use serde::{Deserialize, Serialize};

// ── Modele d'equipement ──

#[derive(Debug, Serialize)]
pub struct ModeleEquipement {
    pub id_modele_equipement: i64,
    pub nom_modele: String,
    pub description: Option<String>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
    pub nb_champs: i64,
    pub nb_familles: i64,
}

#[derive(Debug, Deserialize)]
pub struct ModeleEquipementInput {
    pub nom_modele: String,
    pub description: Option<String>,
}

// ── Champ d'un modele ──

#[derive(Debug, Serialize)]
pub struct ChampModele {
    pub id_champ: i64,
    pub id_modele_equipement: i64,
    pub nom_champ: String,
    pub type_champ: String,
    pub unite: Option<String>,
    pub est_obligatoire: i64,
    pub ordre: i64,
    pub valeurs_possibles: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChampModeleInput {
    pub id_modele_equipement: i64,
    pub nom_champ: String,
    pub type_champ: String,
    pub unite: Option<String>,
    pub est_obligatoire: i64,
    pub ordre: i64,
    pub valeurs_possibles: Option<String>,
}

// ── Valeur d'un champ pour un equipement ──

/// Valeur enrichie : champ + valeur courante (pour affichage et edition)
#[derive(Debug, Serialize)]
pub struct ValeurChampEquipement {
    pub id_champ: i64,
    pub nom_champ: String,
    pub type_champ: String,
    pub unite: Option<String>,
    pub est_obligatoire: i64,
    pub ordre: i64,
    pub valeurs_possibles: Option<String>,
    pub valeur: Option<String>,
}

/// Payload pour sauvegarder une valeur
#[derive(Debug, Deserialize)]
pub struct ValeurEquipementInput {
    pub id_champ: i64,
    pub valeur: Option<String>,
}
```

**Notes :**
- `ModeleEquipement` inclut `nb_champs` et `nb_familles` — calcules par sous-requetes SQL, utiles pour l'affichage en liste.
- `ValeurChampEquipement` fusionne les infos du champ et la valeur — une seule requete SQL retourne tout ce qu'il faut pour afficher/editer.
- `ValeurEquipementInput` est le payload pour l'upsert (un Vec de ces structs est envoye en une fois).

### 3.2 Modifier `models/equipements.rs`

**Struct `Famille` — ajouter :**
```rust
pub id_modele_equipement: Option<i64>,
```

**Struct `FamilleInput` — ajouter :**
```rust
pub id_modele_equipement: Option<i64>,
```

**Struct `FamilleEquipListItem` — ajouter :**
```rust
pub nom_modele: Option<String>,
```

### 3.3 Modifier `models/mod.rs`

Ajouter la declaration du nouveau module :
```rust
pub mod modeles_equipements;
```

## Critere de validation
- `cargo build` compile (attendu : erreurs dans commands/ car les requetes SQL ne matchent pas encore → normal, corrige a l'etape 4)
- Les structs refletent exactement les colonnes du schema
- Les champs `Option<T>` correspondent aux colonnes nullable

## Controle /borg
- Coherence structs ↔ schema SQL
- Pas de champ orphelin ou manquant
- Les derives serde sont corrects (Serialize pour les retours, Deserialize pour les inputs)
