# Étape 4 — Commandes Rust : gammes (CRUD principal)

## Objectif
Réécrire les requêtes SQL des commandes gammes existantes et ajouter les commandes CRUD pour domaines_gammes, familles_gammes, et la liaison gammes_equipements.

## Fichier impacté
- `src-tauri/src/commands/gammes.rs`

## Travail à réaliser

### 1. Réécrire les commandes gammes existantes

**`GAMME_COLS` (constante) :**
- Retirer `id_equipement` de la liste des colonnes
- Remplacer `id_famille` par `id_famille_gamme`

**`row_to_gamme` (mapper) :**
- Mettre à jour les index de colonnes (décalage suite suppression id_equipement)
- `id_famille` → `id_famille_gamme`

**`get_gammes(id_famille?)` :**
- JOIN : `familles_equipements fe ON g.id_famille = fe.id_famille` → `familles_gammes fg ON g.id_famille_gamme = fg.id_famille_gamme`
- Filtre : `g.id_famille = ?1` → `g.id_famille_gamme = ?1`
- Select : `fe.nom_famille` → `fg.nom_famille`
- Paramètre renommé : `id_famille` → `id_famille_gamme`

**`create_gamme(input)` :**
- INSERT : retirer `id_equipement`, remplacer `id_famille` → `id_famille_gamme`

**`update_gamme(id, input)` :**
- UPDATE : retirer `id_equipement`, remplacer `id_famille` → `id_famille_gamme`

**`get_gamme(id)` :**
- Retirer `id_equipement` du SELECT, remplacer `id_famille`

**`delete_gamme(id)` :**
- Inchangé (DELETE par id_gamme)

### 2. Ajouter CRUD domaines_gammes (~5 commandes)

```
get_domaines_gammes()              → SELECT * FROM domaines_gammes
get_domaine_gamme(id)              → SELECT * FROM domaines_gammes WHERE id_domaine_gamme = ?
create_domaine_gamme(input)        → INSERT INTO domaines_gammes (...) VALUES (...)
update_domaine_gamme(id, input)    → UPDATE domaines_gammes SET ... WHERE id_domaine_gamme = ?
delete_domaine_gamme(id)           → DELETE FROM domaines_gammes WHERE id_domaine_gamme = ?
```

### 3. Ajouter CRUD familles_gammes (~5 commandes)

```
get_familles_gammes(id_domaine?)   → SELECT * FROM familles_gammes [WHERE id_domaine_gamme = ?]
get_famille_gamme(id)              → SELECT * FROM familles_gammes WHERE id_famille_gamme = ?
create_famille_gamme(input)        → INSERT INTO familles_gammes (...) VALUES (...)
update_famille_gamme(id, input)    → UPDATE familles_gammes SET ... WHERE id_famille_gamme = ?
delete_famille_gamme(id)           → DELETE FROM familles_gammes WHERE id_famille_gamme = ?
```

### 4. Ajouter commandes liaison gammes_equipements (~4 commandes)

```
get_gamme_equipements(id_gamme)              → SELECT e.* FROM equipements e
                                                JOIN gammes_equipements ge ON ...
                                                WHERE ge.id_gamme = ?
link_gamme_equipement(id_gamme, id_equip)    → INSERT INTO gammes_equipements (id_gamme, id_equipement) VALUES (?, ?)
unlink_gamme_equipement(id_gamme, id_equip)  → DELETE FROM gammes_equipements WHERE id_gamme = ? AND id_equipement = ?
get_equipement_gammes(id_equipement)         → SELECT g.id_gamme, g.nom_gamme, fg.nom_famille, ...
                                                FROM gammes g
                                                JOIN gammes_equipements ge ON ...
                                                JOIN familles_gammes fg ON ...
                                                WHERE ge.id_equipement = ?
```

## Points d'attention
- Utiliser `prepare_cached()` pour les requêtes de liste
- Utiliser `params![]` pour tous les paramètres (jamais `format!()`)
- Messages d'erreur en français
- Scope du Mutex le plus petit possible

## Critère de validation
- `cargo build` compile (erreurs possibles dans d'autres fichiers commands/ → étape 5)
- Les nouvelles commandes suivent les mêmes patterns que l'existant

## Contrôle /borg
Lancer un /borg pour vérifier :
- SQL valide dans toutes les requêtes
- Pas d'injection SQL (params![] partout)
- Cohérence structs ↔ requêtes (nombre de colonnes, types)
