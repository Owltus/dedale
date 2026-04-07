# Phase 3 — Champ d'affichage, protection modele, soft-delete champs

> Prerequis : phases 1 (schema nom_affichage, NOT NULL modele) et 2 (triggers OT) terminees.
> Cette phase ajoute les mecanismes de protection metier autour des modeles et champs.

---

## 3.1 Champ d'affichage principal

### Objectif

Chaque modele d'equipement designe UN champ comme "champ d'affichage". La valeur de ce champ
pour un equipement donne est copiee dans `equipements.nom_affichage`. Cela permet d'afficher un
nom lisible dans les listes, recherches et snapshots OT sans jointure complexe.

Exemple : le modele "Extincteur" possede un champ "Designation". Si ce champ est marque comme
champ d'affichage, alors `nom_affichage` de chaque extincteur vaut la valeur de "Designation".

### Modification schema

Nouvelle colonne sur `modeles_equipements` :

```sql
ALTER TABLE modeles_equipements
ADD COLUMN id_champ_affichage INTEGER
REFERENCES champs_modele(id_champ) ON DELETE RESTRICT;
```

> `ON DELETE RESTRICT` : impossible de supprimer un champ qui sert d'affichage.
> Comme les DELETE seront de toute facon bloques par le trigger soft-delete (section 3.4),
> c'est une double securite.

### Trigger : validation appartenance au modele

Le champ d'affichage doit appartenir au meme modele. On valide sur INSERT et UPDATE.

```sql
DROP TRIGGER IF EXISTS validation_champ_affichage_insert;
CREATE TRIGGER validation_champ_affichage_insert
BEFORE INSERT ON modeles_equipements
WHEN NEW.id_champ_affichage IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM champs_modele
            WHERE id_champ = NEW.id_champ_affichage
              AND id_modele_equipement = NEW.id_modele_equipement
        )
        THEN RAISE(ABORT, 'Le champ d''affichage doit appartenir au meme modele.')
    END;
END;

DROP TRIGGER IF EXISTS validation_champ_affichage_update;
CREATE TRIGGER validation_champ_affichage_update
BEFORE UPDATE ON modeles_equipements
WHEN NEW.id_champ_affichage IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM champs_modele
            WHERE id_champ = NEW.id_champ_affichage
              AND id_modele_equipement = NEW.id_modele_equipement
        )
        THEN RAISE(ABORT, 'Le champ d''affichage doit appartenir au meme modele.')
    END;
END;
```

> Note : le trigger INSERT ne sera utile qu'en cas d'INSERT avec un `id_champ_affichage`
> pre-rempli (scenario seed/migration). En usage normal, on cree le modele puis on definit
> le champ d'affichage via UPDATE.

### Trigger : le champ d'affichage ne peut pas etre archive

Voir section 3.4 (trigger `protection_archivage_champ_affichage`).

### Nullable temporaire

`id_champ_affichage` peut etre NULL — c'est le cas a la creation du modele, avant d'avoir
ajoute des champs. La protection se fait au niveau de `familles_equipements` : on ne peut pas
rattacher une famille a un modele dont le champ d'affichage n'est pas encore defini.

---

## 3.2 Trigger blocage changement modele

### Objectif

Empecher de changer le modele d'une famille qui contient deja des equipements. Les valeurs
des champs sont liees au modele — changer de modele rendrait les donnees incoherentes.

### SQL

```sql
DROP TRIGGER IF EXISTS protection_changement_modele;
CREATE TRIGGER protection_changement_modele
BEFORE UPDATE ON familles_equipements
WHEN OLD.id_modele_equipement IS NOT NULL
  AND NEW.id_modele_equipement != OLD.id_modele_equipement
  AND EXISTS (SELECT 1 FROM equipements WHERE id_famille = NEW.id_famille)
BEGIN
    SELECT RAISE(ABORT, 'Impossible de changer le modele : des equipements sont rattaches a cette famille. Supprimez ou deplacez les equipements d''abord.');
END;
```

### Comportement attendu

| Situation | Resultat |
|-----------|----------|
| Famille vide, changement de modele | OK |
| Famille avec equipements, changement de modele | ABORT |
| Famille vide, passage de NULL a un modele | OK (pas de changement, c'est un premier rattachement) |
| Famille avec equipements, modele identique | OK (WHEN filtre `!=`) |

---

## 3.3 Trigger blocage modele sans champ d'affichage

### Objectif

Quand on rattache une famille a un modele (INSERT ou UPDATE sur `familles_equipements`),
verifier que le modele a bien un `id_champ_affichage` defini. Un modele sans champ d'affichage
est considere "en cours de configuration" et ne peut pas encore recevoir d'equipements.

### SQL

```sql
DROP TRIGGER IF EXISTS validation_modele_champ_affichage_insert;
CREATE TRIGGER validation_modele_champ_affichage_insert
BEFORE INSERT ON familles_equipements
WHEN NEW.id_modele_equipement IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM modeles_equipements
            WHERE id_modele_equipement = NEW.id_modele_equipement
              AND id_champ_affichage IS NOT NULL
        )
        THEN RAISE(ABORT, 'Impossible de rattacher une famille a ce modele : aucun champ d''affichage n''est defini.')
    END;
END;

DROP TRIGGER IF EXISTS validation_modele_champ_affichage_update;
CREATE TRIGGER validation_modele_champ_affichage_update
BEFORE UPDATE ON familles_equipements
WHEN NEW.id_modele_equipement IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM modeles_equipements
            WHERE id_modele_equipement = NEW.id_modele_equipement
              AND id_champ_affichage IS NOT NULL
        )
        THEN RAISE(ABORT, 'Impossible de rattacher une famille a ce modele : aucun champ d''affichage n''est defini.')
    END;
END;
```

### Workflow utilisateur

1. Creer le modele (nom, description) — `id_champ_affichage = NULL`
2. Ajouter des champs au modele
3. Definir le champ d'affichage (UPDATE du modele)
4. Seulement maintenant : rattacher une famille au modele

Le frontend devra guider l'utilisateur en desactivant le bouton de rattachement si le modele
n'a pas de champ d'affichage.

---

## 3.4 Soft-delete des champs (est_archive)

### Objectif

Ne jamais supprimer physiquement un champ. Les valeurs existantes doivent etre conservees
pour l'historique et les equipements deja renseignes. Un champ archive n'apparait plus dans
les formulaires de creation mais reste visible en lecture seule sur les equipements existants.

### Modification schema

Nouvelle colonne sur `champs_modele` :

```sql
ALTER TABLE champs_modele
ADD COLUMN est_archive INTEGER NOT NULL DEFAULT 0
CHECK (est_archive IN (0, 1));
```

### Trigger : interdiction du DELETE

```sql
DROP TRIGGER IF EXISTS protection_suppression_champ;
CREATE TRIGGER protection_suppression_champ
BEFORE DELETE ON champs_modele
BEGIN
    SELECT RAISE(ABORT, 'Impossible de supprimer un champ. Utilisez l''archivage (est_archive = 1) a la place.');
END;
```

> Ce trigger bloque TOUT delete, sans exception. Si le modele entier est supprime
> (`ON DELETE CASCADE` sur la FK), SQLite execute le trigger AVANT le cascade — le delete
> du modele sera donc bloque aussi si des champs existent. C'est le comportement voulu :
> un modele avec des champs ne peut pas etre supprime.

### Trigger : interdiction d'archiver le champ d'affichage

```sql
DROP TRIGGER IF EXISTS protection_archivage_champ_affichage;
CREATE TRIGGER protection_archivage_champ_affichage
BEFORE UPDATE ON champs_modele
WHEN NEW.est_archive = 1 AND OLD.est_archive = 0
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM modeles_equipements
            WHERE id_champ_affichage = NEW.id_champ
        )
        THEN RAISE(ABORT, 'Impossible d''archiver le champ d''affichage du modele. Changez d''abord le champ d''affichage.')
    END;
END;
```

### Comportement attendu

| Action | Resultat |
|--------|----------|
| `DELETE FROM champs_modele WHERE id_champ = X` | ABORT — toujours |
| `UPDATE champs_modele SET est_archive = 1 WHERE id_champ = X` (champ normal) | OK |
| `UPDATE champs_modele SET est_archive = 1 WHERE id_champ = X` (champ d'affichage) | ABORT |
| `UPDATE champs_modele SET est_archive = 0 WHERE id_champ = X` | OK (desarchivage) |
| `DELETE FROM modeles_equipements WHERE id_modele_equipement = Y` (modele avec champs) | ABORT (cascade bloquee par protection_suppression_champ) |
| `DELETE FROM modeles_equipements WHERE id_modele_equipement = Y` (modele sans champs) | OK |

### Impact frontend

- Formulaire de creation d'equipement : ne pas afficher les champs archives (`est_archive = 0`)
- Page detail d'un equipement existant : afficher les champs archives en lecture seule si une valeur existe
- Page detail d'un modele : afficher les champs archives avec un indicateur visuel (icone, opacite)
- Le bouton "Supprimer" un champ devient "Archiver" dans l'UI

---

## 3.5 Commandes Rust modifiees

Fichier : `src-tauri/src/commands/modeles_equipements.rs`

### Modifications sur les commandes existantes

#### `get_champs_modele(id_modele_equipement, inclure_archives?)`

Ajouter un parametre optionnel `inclure_archives: bool` (defaut `false`).

```rust
// Avant
"SELECT {CHAMP_COLUMNS} FROM champs_modele
 WHERE id_modele_equipement = ?1 ORDER BY ordre, nom_champ"

// Apres
// Si inclure_archives = false :
"SELECT {CHAMP_COLUMNS} FROM champs_modele
 WHERE id_modele_equipement = ?1 AND est_archive = 0
 ORDER BY ordre, nom_champ"

// Si inclure_archives = true :
"SELECT {CHAMP_COLUMNS} FROM champs_modele
 WHERE id_modele_equipement = ?1
 ORDER BY ordre, nom_champ"
```

Utilisation :
- Page configuration du modele : `inclure_archives = true` (voir tous les champs)
- Formulaire creation equipement : `inclure_archives = false` (champs actifs uniquement)
- Formulaire edition equipement : `inclure_archives = true` (voir les anciennes valeurs)

#### `create_modele_equipement(input)`

Pas de changement structurel. Le `id_champ_affichage` sera NULL a la creation.
Le MODELE_SELECT doit inclure la nouvelle colonne pour que le retour contienne `id_champ_affichage`.

Modifier `MODELE_SELECT` :

```rust
const MODELE_SELECT: &str =
    "SELECT me.id_modele_equipement, me.nom_modele, me.description, \
     me.date_creation, me.date_modification, me.id_champ_affichage, \
     (SELECT COUNT(*) FROM champs_modele cm WHERE cm.id_modele_equipement = me.id_modele_equipement AND cm.est_archive = 0) AS nb_champs, \
     (SELECT COUNT(*) FROM familles_equipements fe WHERE fe.id_modele_equipement = me.id_modele_equipement) AS nb_familles \
     FROM modeles_equipements me";
```

> Note : `nb_champs` ne compte que les champs actifs (non archives).

Modifier `row_to_modele` pour lire `id_champ_affichage` (index 5 apres reordering).

#### `update_modele_equipement(id, input)`

Accepter `id_champ_affichage` dans l'input :

```rust
// ModeleEquipementInput modifie (voir section 3.6)
conn.execute(
    "UPDATE modeles_equipements SET nom_modele = ?1, description = ?2, \
     id_champ_affichage = ?3 WHERE id_modele_equipement = ?4",
    params![input.nom_modele, input.description, input.id_champ_affichage, id],
)
```

Le trigger `validation_champ_affichage_update` bloquera si le champ n'appartient pas au modele.

#### `get_valeurs_equipement(id_equipement)`

La requete actuelle fait un JOIN depuis `champs_modele` et retourne tous les champs. Il faut :

1. Ajouter `cm.est_archive` dans le SELECT
2. Retourner les champs archives **seulement s'ils ont une valeur** (pour l'edition)
3. Retourner tous les champs actifs (meme sans valeur)

```sql
SELECT cm.id_champ, cm.nom_champ, cm.type_champ, cm.unite,
       cm.est_obligatoire, cm.ordre, cm.valeurs_possibles,
       cm.est_archive,
       ve.valeur
FROM champs_modele cm
JOIN modeles_equipements me ON cm.id_modele_equipement = me.id_modele_equipement
JOIN familles_equipements fe ON fe.id_modele_equipement = me.id_modele_equipement
JOIN equipements e ON e.id_famille = fe.id_famille
LEFT JOIN valeurs_equipements ve ON ve.id_champ = cm.id_champ AND ve.id_equipement = e.id_equipement
WHERE e.id_equipement = ?1
  AND (cm.est_archive = 0 OR ve.valeur IS NOT NULL)
ORDER BY cm.ordre, cm.nom_champ
```

> La clause `(cm.est_archive = 0 OR ve.valeur IS NOT NULL)` filtre les champs archives
> qui n'ont jamais eu de valeur pour cet equipement.

### Nouvelle commande

#### `archive_champ_modele(id: i64) -> Result<(), String>`

```rust
#[tauri::command]
pub fn archive_champ_modele(db: State<DbPool>, id: i64) -> Result<(), String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE champs_modele SET est_archive = 1 WHERE id_champ = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
```

Le trigger `protection_archivage_champ_affichage` bloquera si le champ est le champ d'affichage.

### Commande supprimee

#### `delete_champ_modele`

Supprimer cette commande. Le trigger `protection_suppression_champ` bloquerait de toute facon.
Remplacee par `archive_champ_modele`.

Retirer de `tauri::generate_handler![]` dans `lib.rs`.
Ajouter `archive_champ_modele` dans `tauri::generate_handler![]`.

### Commande optionnelle

#### `unarchive_champ_modele(id: i64) -> Result<(), String>`

Desarchiver un champ (remettre `est_archive = 0`). Utile si un archivage est accidentel.
Pas de trigger de blocage sur le desarchivage.

---

## 3.6 Structs Rust modifiees

Fichier : `src-tauri/src/models/modeles_equipements.rs`

### ModeleEquipement

```rust
#[derive(Debug, Serialize)]
pub struct ModeleEquipement {
    pub id_modele_equipement: i64,
    pub nom_modele: String,
    pub description: Option<String>,
    pub date_creation: Option<String>,
    pub date_modification: Option<String>,
    pub id_champ_affichage: Option<i64>,  // NOUVEAU
    pub nb_champs: i64,
    pub nb_familles: i64,
}
```

### ModeleEquipementInput

```rust
#[derive(Debug, Deserialize)]
pub struct ModeleEquipementInput {
    pub nom_modele: String,
    pub description: Option<String>,
    pub id_champ_affichage: Option<i64>,  // NOUVEAU
}
```

### ChampModele

```rust
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
    pub est_archive: i64,  // NOUVEAU
}
```

### ValeurChampEquipement

```rust
#[derive(Debug, Serialize)]
pub struct ValeurChampEquipement {
    pub id_champ: i64,
    pub nom_champ: String,
    pub type_champ: String,
    pub unite: Option<String>,
    pub est_obligatoire: i64,
    pub ordre: i64,
    pub valeurs_possibles: Option<String>,
    pub est_archive: i64,  // NOUVEAU
    pub valeur: Option<String>,
}
```

---

## 3.7 Criteres de validation

Checklist pour verifier que toutes les protections fonctionnent :

### Tests SQL (via `sqlite3` ou seed)

| # | Test | Resultat attendu |
|---|------|------------------|
| 1 | Creer un modele, ajouter 2 champs, definir le champ 1 comme affichage | OK |
| 2 | Definir un champ d'un AUTRE modele comme affichage | ABORT — "doit appartenir au meme modele" |
| 3 | Rattacher une famille au modele (champ d'affichage defini) | OK |
| 4 | Rattacher une famille a un modele SANS champ d'affichage | ABORT — "aucun champ d'affichage" |
| 5 | Changer le modele d'une famille VIDE (sans equipements) | OK |
| 6 | Changer le modele d'une famille avec equipements | ABORT — "des equipements sont rattaches" |
| 7 | `DELETE FROM champs_modele WHERE id_champ = X` | ABORT — "Utilisez l'archivage" |
| 8 | `UPDATE champs_modele SET est_archive = 1` (champ normal) | OK |
| 9 | `UPDATE champs_modele SET est_archive = 1` (champ d'affichage) | ABORT — "Changez d'abord le champ d'affichage" |
| 10 | `UPDATE champs_modele SET est_archive = 0` (desarchiver) | OK |
| 11 | Supprimer un modele qui a des champs | ABORT (cascade bloquee) |
| 12 | Supprimer un modele sans champs | OK |

### Tests Rust (via l'app)

| # | Test | Resultat attendu |
|---|------|------------------|
| 1 | `get_champs_modele(id, false)` — modele avec 3 champs dont 1 archive | Retourne 2 champs |
| 2 | `get_champs_modele(id, true)` — meme modele | Retourne 3 champs |
| 3 | `archive_champ_modele(id)` — champ normal | OK, `est_archive = 1` |
| 4 | `archive_champ_modele(id)` — champ d'affichage | Erreur trigger propagee |
| 5 | `update_modele_equipement(id, input)` avec `id_champ_affichage` valide | OK |
| 6 | `update_modele_equipement(id, input)` avec champ d'un autre modele | Erreur trigger propagee |
| 7 | `get_valeurs_equipement(id)` — equipement avec 1 champ archive ayant une valeur | Retourne le champ archive avec sa valeur |
| 8 | `get_valeurs_equipement(id)` — equipement avec 1 champ archive sans valeur | Ne retourne pas ce champ |

---

## Resume des modifications schema

| Table | Modification | Type |
|-------|-------------|------|
| `modeles_equipements` | `id_champ_affichage INTEGER REFERENCES champs_modele(id_champ) ON DELETE RESTRICT` | ADD COLUMN |
| `champs_modele` | `est_archive INTEGER NOT NULL DEFAULT 0 CHECK (est_archive IN (0, 1))` | ADD COLUMN |

## Resume des triggers ajoutes

| Trigger | Table | Evenement | Role |
|---------|-------|-----------|------|
| `validation_champ_affichage_insert` | `modeles_equipements` | BEFORE INSERT | Champ d'affichage doit appartenir au modele |
| `validation_champ_affichage_update` | `modeles_equipements` | BEFORE UPDATE | Idem sur UPDATE |
| `protection_changement_modele` | `familles_equipements` | BEFORE UPDATE | Bloquer changement modele si equipements existent |
| `validation_modele_champ_affichage_insert` | `familles_equipements` | BEFORE INSERT | Bloquer rattachement si pas de champ d'affichage |
| `validation_modele_champ_affichage_update` | `familles_equipements` | BEFORE UPDATE | Idem sur UPDATE |
| `protection_suppression_champ` | `champs_modele` | BEFORE DELETE | Interdire tout DELETE |
| `protection_archivage_champ_affichage` | `champs_modele` | BEFORE UPDATE | Interdire archivage du champ d'affichage |

## Resume des modifications Rust

| Fichier | Modification |
|---------|-------------|
| `models/modeles_equipements.rs` | `ModeleEquipement` +`id_champ_affichage`, `ModeleEquipementInput` +`id_champ_affichage`, `ChampModele` +`est_archive`, `ValeurChampEquipement` +`est_archive` |
| `commands/modeles_equipements.rs` | `MODELE_SELECT` modifie, `CHAMP_COLUMNS` modifie, `get_champs_modele` +filtre archives, `update_modele_equipement` +id_champ_affichage, `get_valeurs_equipement` +filtre archives, `archive_champ_modele` ajoutee, `delete_champ_modele` supprimee |
| `lib.rs` | Retirer `delete_champ_modele`, ajouter `archive_champ_modele` dans `generate_handler![]` |
