---
paths:
  - "src-tauri/**/*.rs"
---

# Règles Rust / Tauri v2

## Commandes Tauri

- Toute commande retourne `Result<T, String>` — convertir les erreurs avec `.map_err(|e| e.to_string())`
- Les messages d'erreur des triggers SQLite (`RAISE(ABORT, '...')`) sont en français et métier — les propager tels quels, ne pas les traduire ou reformater
- Utiliser `State<Mutex<Connection>>` pour accéder à la DB — jamais de globale statique
- Garder le scope du `Mutex::lock()` le plus petit possible — lock, exécuter la requête, collecter dans un `Vec`, drop le guard, puis retourner
- Enregistrer chaque commande dans `tauri::generate_handler![]` ET dans les capabilities JSON

## SQL

- SQL brut uniquement via `rusqlite` — pas d'ORM, pas de query builder
- Utiliser `conn.prepare_cached()` pour les requêtes exécutées souvent (listes, recherches)
- Utiliser `params![]` ou `named_params!{}` pour les paramètres — **jamais** de `format!()` pour construire du SQL
- Utiliser `conn.execute()` pour INSERT/UPDATE/DELETE, `conn.query_row()` pour un résultat, `conn.query_map()` pour plusieurs
- Gérer `QueryReturnedNoRows` explicitement — mapper vers `None` ou une erreur métier
- Encapsuler les écritures multiples dans une transaction : `let tx = conn.transaction()?; ... tx.commit()?;`

## Modèles (structs)

- Dériver `Serialize` (et `Deserialize` si nécessaire) via serde
- 1 fichier par domaine dans `models/`
- Les noms de champs Rust doivent correspondre aux colonnes SQL (snake_case français)
- Utiliser `Option<T>` pour les colonnes nullable
- Les booléens SQL (`INTEGER 0/1`) se mappent sur `i64`, pas `bool` — SQLite STRICT mode ne supporte pas les booléens natifs

## Erreurs

- Créer les messages d'erreur en français pour les validations côté Rust
- Ne pas masquer les erreurs trigger — les propager intégralement
- Pour les erreurs de FK RESTRICT, retourner un message explicite au lieu du cryptique "FOREIGN KEY constraint failed"

## Effets système

- Après un INSERT/UPDATE qui peut déclencher des triggers, re-requêter l'état complet pour détecter les effets (auto-clôture, reprogrammation, cascade)
- Retourner un struct `CommandResult { data: T, effets: Vec<Effet> }` pour les commandes OT
