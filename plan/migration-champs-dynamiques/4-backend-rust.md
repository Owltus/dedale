# Etape 4 — Backend Rust (commands + models)

## Objectif
Adapter les structs et commandes Rust pour refleter le nouveau schema sans colonnes fixes sur equipements. Modifier la recherche globale et l'export CSV.

## Fichiers impactes
- `src-tauri/src/models/equipements.rs`
- `src-tauri/src/models/modeles_equipements.rs`
- `src-tauri/src/models/ordres_travail.rs`
- `src-tauri/src/commands/equipements.rs`
- `src-tauri/src/commands/modeles_equipements.rs`
- `src-tauri/src/commands/gammes.rs`
- `src-tauri/src/commands/recherche.rs`
- `src-tauri/src/commands/export.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/src/db.rs`

## Travail a realiser

### 4.1 Modifier `models/equipements.rs`

**Struct `Equipement` — retirer :**
```rust
// SUPPRIMER
pub nom: String,
pub numero_serie: Option<String>,
pub marque: Option<String>,
pub modele: Option<String>,
```

**Struct `Equipement` — ajouter :**
```rust
pub nom_affichage: String,
```

**Struct `EquipementInput` — retirer :**
```rust
// SUPPRIMER
pub nom: String,
pub numero_serie: Option<String>,
pub marque: Option<String>,
pub modele: Option<String>,
```

**Struct `EquipementListItem` — modifier :**
```rust
// REMPLACER nom, marque, modele PAR :
pub nom_affichage: String,
```

**Struct `Famille` / `FamilleInput` :**
- `id_modele_equipement` passe de `Option<i64>` a `i64` (NOT NULL)

### 4.2 Modifier `models/modeles_equipements.rs`

**Struct `ModeleEquipement` — ajouter :**
```rust
pub id_champ_affichage: Option<i64>,
```

**Struct `ModeleEquipementInput` — ajouter :**
```rust
pub id_champ_affichage: Option<i64>,
```

**Struct `ChampModele` — ajouter :**
```rust
pub est_archive: i64,
```

### 4.3 Modifier `models/ordres_travail.rs`

**Struct `OrdreTravail` — supprimer :**
```rust
// SUPPRIMER (la colonne disparait de ordres_travail)
pub numero_serie_equipement: Option<String>,
```

### 4.4 Modifier `commands/equipements.rs`

**Constante `EQUIPEMENT_COLUMNS` :**
```rust
const EQUIPEMENT_COLUMNS: &str =
    "id_equipement, nom_affichage, date_mise_en_service, \
     date_fin_garantie, id_famille, id_local, est_actif, commentaires, id_image, \
     date_creation, date_modification";
```

**Fonction `row_to_equipement` :** adapter les indices de colonnes.

**`get_equipements_list` :**
- Remplacer `e.nom, e.commentaires, e.marque, e.modele` par `e.nom_affichage, e.commentaires`
- ORDER BY `e.nom_affichage`

**`create_equipement` :**
- Retirer nom, numero_serie, marque, modele de l'INSERT
- Le nom_affichage sera rempli par le trigger apres sauvegarde des valeurs
- Mais probleme : a la creation, les valeurs n'existent pas encore
- **Solution :** accepter un `nom_affichage` temporaire dans l'input,
  OU faire la creation en 2 temps (create equipement → save valeurs → le trigger met a jour nom_affichage)
- **Recommandation :** le frontend envoie `nom_affichage` initial dans l'input de creation.
  Le trigger le corrigera des que la valeur du champ d'affichage sera sauvegardee.

**`update_equipement` :** retirer nom, numero_serie, marque, modele du SET.

**`get_familles` / `create_famille` / `update_famille` :**
- `id_modele_equipement` n'est plus nullable — retirer les Option<>
- L'INSERT et UPDATE doivent toujours inclure id_modele_equipement

### 4.5 Modifier `commands/modeles_equipements.rs`

**MODELE_SELECT :** ajouter `me.id_champ_affichage` au SELECT.

**`row_to_modele` :** ajouter le champ.

**`create_modele_equipement` / `update_modele_equipement` :** accepter `id_champ_affichage`.

**CHAMP_COLUMNS :** ajouter `est_archive` au SELECT.

**`row_to_champ` :** ajouter le champ.

**`get_champs_modele` :** ajouter parametre optionnel `inclure_archives: Option<bool>`.
Si false (defaut), filtrer `WHERE est_archive = 0`.

**Nouvelle commande `archive_champ_modele(id)` :**
```rust
conn.execute(
    "UPDATE champs_modele SET est_archive = 1 WHERE id_champ = ?1",
    params![id],
)?;
```

**`delete_champ_modele` :** SUPPRIMER cette commande (remplacee par archive).
Le trigger SQL empechera le DELETE de toute facon.

### 4.6 Modifier `commands/gammes.rs`

**`get_gamme_equipements` :**
- Remplacer `e.nom, e.numero_serie, e.marque, e.modele` par `e.nom_affichage`
- Adapter le mapping struct

### 4.7 Modifier `commands/recherche.rs`

**Recherche globale :**
- Remplacer `SELECT 'Equipement', id_equipement, nom, marque FROM equipements WHERE nom LIKE ?1`
  par `SELECT 'Equipement', id_equipement, nom_affichage, commentaires FROM equipements WHERE nom_affichage LIKE ?1`
- Le nom_affichage est indexe, performance preservee

### 4.8 Modifier `commands/export.rs`

**`export_csv_equipements` :**
- Remplacer les colonnes fixes par `nom_affichage`
- Ajouter un JOIN vers `valeurs_equipements` + `champs_modele` pour exporter les champs dynamiques
- **Approche simplifiee :** exporter (ID, Nom affichage, Famille, Localisation, Actif, Mise en service, Fin garantie)
- Les champs dynamiques sont trop variables pour un CSV unique → laisser pour une V2

### 4.9 Modifier `lib.rs`

- Retirer `commands::modeles_equipements::delete_champ_modele`
- Ajouter `commands::modeles_equipements::archive_champ_modele`

### 4.10 Modifier `db.rs`

- Bumper `SCHEMA_VERSION` a 12

## Critere de validation
- `cargo build` compile sans erreur
- Aucune reference a `equipements.nom` (sauf `nom_affichage`), `.marque`, `.modele`, `.numero_serie` dans les commandes
- La recherche globale fonctionne via `nom_affichage`
- L'export CSV fonctionne sans colonnes fixes

## Controle /borg
- Coherence structs ↔ schema SQL
- Coherence colonnes SELECT ↔ champs struct
- Pas d'injection SQL
- Transactions la ou necessaire
