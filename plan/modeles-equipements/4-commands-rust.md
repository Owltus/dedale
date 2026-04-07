# Etape 4 — Commandes Rust (Tauri)

## Objectif
Creer les commandes CRUD pour les modeles d'equipement, les champs et les valeurs. Modifier les commandes familles pour supporter le modele.

## Fichiers impactes
- `src-tauri/src/commands/modeles_equipements.rs` (NOUVEAU)
- `src-tauri/src/commands/equipements.rs` (modifie)
- `src-tauri/src/commands/mod.rs` (modifie)

## Travail a realiser

### 4.1 Nouveau fichier `commands/modeles_equipements.rs`

#### CRUD Modeles

**`get_modeles_equipements()`** → `Vec<ModeleEquipement>`
```sql
SELECT me.id_modele_equipement, me.nom_modele, me.description,
       me.date_creation, me.date_modification,
       (SELECT COUNT(*) FROM champs_modele cm WHERE cm.id_modele_equipement = me.id_modele_equipement) AS nb_champs,
       (SELECT COUNT(*) FROM familles_equipements fe WHERE fe.id_modele_equipement = me.id_modele_equipement) AS nb_familles
FROM modeles_equipements me
ORDER BY me.nom_modele
```

**`get_modele_equipement(id)`** → `ModeleEquipement`
Meme requete avec `WHERE me.id_modele_equipement = ?1`

**`create_modele_equipement(input)`** → `ModeleEquipement`
INSERT + re-requete pour retourner l'objet complet avec compteurs.

**`update_modele_equipement(id, input)`** → `ModeleEquipement`
UPDATE + re-requete.

**`delete_modele_equipement(id)`** → `()`
DELETE simple. Le CASCADE se charge des champs et valeurs.
Le SET NULL sur `familles_equipements.id_modele_equipement` delie les familles.

#### CRUD Champs

**`get_champs_modele(id_modele_equipement)`** → `Vec<ChampModele>`
```sql
SELECT id_champ, id_modele_equipement, nom_champ, type_champ, unite,
       est_obligatoire, ordre, valeurs_possibles
FROM champs_modele
WHERE id_modele_equipement = ?1
ORDER BY ordre, nom_champ
```

**`create_champ_modele(input)`** → `ChampModele`
INSERT + re-requete.

**`update_champ_modele(id, input)`** → `ChampModele`
UPDATE + re-requete.

**`delete_champ_modele(id)`** → `()`
DELETE simple. CASCADE supprime les valeurs associees.

**`reorder_champs_modele(id_modele_equipement, ids: Vec<i64>)`** → `()`
Transaction : pour chaque id dans le Vec, UPDATE `ordre` = index.
```rust
let tx = conn.transaction()?;
for (index, id_champ) in ids.iter().enumerate() {
    tx.execute(
        "UPDATE champs_modele SET ordre = ?1 WHERE id_champ = ?2 AND id_modele_equipement = ?3",
        params![index as i64, id_champ, id_modele_equipement],
    )?;
}
tx.commit()?;
```

#### Valeurs equipement

**`get_valeurs_equipement(id_equipement)`** → `Vec<ValeurChampEquipement>`

Requete enrichie qui retourne les champs du modele de la famille de l'equipement, avec les valeurs actuelles :

```sql
SELECT cm.id_champ, cm.nom_champ, cm.type_champ, cm.unite,
       cm.est_obligatoire, cm.ordre, cm.valeurs_possibles,
       ve.valeur
FROM champs_modele cm
JOIN modeles_equipements me ON cm.id_modele_equipement = me.id_modele_equipement
JOIN familles_equipements fe ON fe.id_modele_equipement = me.id_modele_equipement
JOIN equipements e ON e.id_famille = fe.id_famille
LEFT JOIN valeurs_equipements ve ON ve.id_champ = cm.id_champ AND ve.id_equipement = e.id_equipement
WHERE e.id_equipement = ?1
ORDER BY cm.ordre, cm.nom_champ
```

**Notes :**
- LEFT JOIN sur `valeurs_equipements` : si l'equipement n'a pas encore de valeur pour un champ, `valeur` = NULL.
- La chaine de JOINs (equipement → famille → modele → champs) retrouve automatiquement le bon modele.
- Si la famille n'a pas de modele, la requete retourne 0 lignes (pas d'erreur).

**`save_valeurs_equipement(id_equipement, valeurs: Vec<ValeurEquipementInput>)`** → `()`

Transaction avec UPSERT pour chaque valeur :
```rust
let tx = conn.transaction()?;
for v in &valeurs {
    if let Some(ref val) = v.valeur {
        tx.execute(
            "INSERT INTO valeurs_equipements (id_equipement, id_champ, valeur)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(id_equipement, id_champ) DO UPDATE SET valeur = ?3",
            params![id_equipement, v.id_champ, val],
        )?;
    } else {
        tx.execute(
            "DELETE FROM valeurs_equipements WHERE id_equipement = ?1 AND id_champ = ?2",
            params![id_equipement, v.id_champ],
        )?;
    }
}
tx.commit()?;
```

**Note :** si `valeur` est NULL, on supprime la ligne plutot que de stocker NULL — plus propre, evite les lignes fantomes.

### 4.2 Modifier `commands/equipements.rs`

#### Familles — ajouter `id_modele_equipement`

Toutes les requetes SELECT sur `familles_equipements` doivent inclure `id_modele_equipement` :

**`get_familles`** : ajouter la colonne au SELECT + au mapping struct.
**`get_famille`** : idem.
**`create_famille`** : ajouter dans INSERT + VALUES.
**`update_famille`** : ajouter dans SET.
**`get_familles_equip_list`** : ajouter `nom_modele` via un LEFT JOIN :
```sql
LEFT JOIN modeles_equipements me ON fe.id_modele_equipement = me.id_modele_equipement
```
Selectionner `me.nom_modele`.

#### `FamilleInput` — ajouter le parametre
Deja fait a l'etape 3 (struct). Ici on s'assure que les requetes INSERT/UPDATE l'utilisent.

### 4.3 Modifier `commands/mod.rs`

Ajouter la declaration du nouveau module :
```rust
pub mod modeles_equipements;
```

## Critere de validation
- `cargo build` compile sans erreur
- Toutes les commandes retournent `Result<T, String>`
- Les noms de commandes suivent la convention existante (snake_case)
- Les requetes SQL utilisent `params![]` (pas de `format!()`)

## Controle /borg
- Coherence noms commandes ↔ futurs noms dans `lib.rs`
- Coherence colonnes SELECT ↔ champs struct
- Pas d'injection SQL
- Transactions correctement utilisees pour les ecritures multiples
