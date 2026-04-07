# Etape 5 — Enregistrement dans lib.rs

## Objectif
Enregistrer toutes les nouvelles commandes dans `tauri::generate_handler![]`.

## Fichier impacte
- `src-tauri/src/lib.rs`

## Travail a realiser

### 5.1 Ajouter les commandes modeles d'equipement

Dans `generate_handler![]`, ajouter (apres les commandes equipements existantes) :

```rust
// Modeles d'equipement
commands::modeles_equipements::get_modeles_equipements,
commands::modeles_equipements::get_modele_equipement,
commands::modeles_equipements::create_modele_equipement,
commands::modeles_equipements::update_modele_equipement,
commands::modeles_equipements::delete_modele_equipement,
// Champs modele
commands::modeles_equipements::get_champs_modele,
commands::modeles_equipements::create_champ_modele,
commands::modeles_equipements::update_champ_modele,
commands::modeles_equipements::delete_champ_modele,
commands::modeles_equipements::reorder_champs_modele,
// Valeurs equipement
commands::modeles_equipements::get_valeurs_equipement,
commands::modeles_equipements::save_valeurs_equipement,
```

**Total : 12 nouvelles commandes.**

### 5.2 Bump version schema

Dans `db.rs`, incrementer `SCHEMA_VERSION` :
```rust
const SCHEMA_VERSION: i64 = 11;  // etait 10
```

Et mettre a jour `seed.py` :
```python
db.execute("PRAGMA user_version = 11")
```

## Critere de validation
- `cargo build` compile sans erreur
- Toutes les 12 commandes sont enregistrees
- Pas de doublon dans le handler

## Controle /borg
- Chaque commande `#[tauri::command]` a bien une entree correspondante dans le handler
- Pas de commande enregistree qui n'existe pas
