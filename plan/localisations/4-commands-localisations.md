# Étape 4 — Commands localisations.rs

## Objectif
Réécrire les commandes CRUD pour les 3 niveaux + helper arbre.

## Fichier impacté
- `src-tauri/src/commands/localisations.rs`

## Travail à réaliser

### Supprimer
- `get_localisations_tree` (récursif)
- `get_localisation`, `create_localisation`, `update_localisation`, `delete_localisation`

### Créer — CRUD Bâtiments (5 commandes)
```
get_batiments()           → Vec<Batiment>
get_batiment(id)          → Batiment
create_batiment(input)    → Batiment
update_batiment(id, input)→ Batiment
delete_batiment(id)       → ()
```

### Créer — CRUD Niveaux (5 commandes)
```
get_niveaux(id_batiment?) → Vec<Niveau>
get_niveau(id)            → Niveau
create_niveau(input)      → Niveau
update_niveau(id, input)  → Niveau
delete_niveau(id)         → ()
```

### Créer — CRUD Locaux (5 commandes)
```
get_locaux(id_niveau?)    → Vec<Local>
get_local(id)             → Local
create_local(input)       → Local
update_local(id, input)   → Local
delete_local(id)          → ()
```

### Créer — Helper arbre (1 commande)
```
get_localisations_tree()  → Vec<LocalisationTreeNode>
```
Requête : JOIN batiments + niveaux + locaux, retourne liste aplatie avec `label` = "Bât A > RDC > Cuisine" pour les dropdowns dans gammes/équipements.

## Critère de validation
- `cargo build` (erreurs attendues dans d'autres commands/ → étape 5)
