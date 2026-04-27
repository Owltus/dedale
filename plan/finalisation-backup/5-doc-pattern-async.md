# Étape 5 — Documentation du pattern async + spawn_blocking

## Objectif

Capitaliser la leçon apprise lors de l'audit Borg du 27/04 : toute commande Tauri synchrone qui peut dépasser 100 ms doit être en `async fn` + `tauri::async_runtime::spawn_blocking`. Documenter ça dans `.claude/rules/rust-backend.md` pour que le futur dev (ou Claude) ne refasse pas la même erreur sur la prochaine commande longue.

## Contexte

Le projet contient déjà 3 commandes asynchrones (`backup_create`, `backup_restore`, `restore_pre_restore`) qui suivent ce pattern. Les autres commandes du codebase sont rapides (lectures simples, mutations courtes) et restent synchrones — c'est OK.

Ce qui manque dans la doc, c'est la **règle de décision** : quand passer en async ? Quand `spawn_blocking` ? Quand garder synchrone ?

## Fichier(s) impacté(s)

- `.claude/rules/rust-backend.md`

## Travail à réaliser

### 1. Ajouter une nouvelle section après « Commandes Tauri »

Insérer après la section actuelle « Commandes Tauri » (vers la ligne 14 du fichier) :

```markdown
## Commandes longues (async + spawn_blocking)

Une `#[tauri::command] fn` synchrone s'exécute sur le main thread du webview Tauri. Toute opération qui peut dépasser ~100 ms (CPU intensif, I/O conséquent, sleep) **gèlera l'UI** et déclenchera le « Ne répond pas » de Windows.

Règle de décision :

| Durée typique | Type d'opération | Pattern requis |
|---|---|---|
| < 50 ms | Read SQL simple, mutation rapide | `pub fn` synchrone — OK |
| 50–100 ms | Petites jointures, ~10 INSERTs | `pub fn` synchrone — borderline |
| > 100 ms | Backup, export, calcul, gros zip | **`pub async fn` + `spawn_blocking` obligatoire** |

Pattern obligatoire pour les commandes longues :

```rust
#[tauri::command]
pub async fn ma_commande_longue(
    app: AppHandle,
    /* args */
) -> Result<MonRetour, String> {
    let app_for_blocking = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app_for_blocking.state::<DbPool>();
        ma_commande_longue_blocking(&app_for_blocking, &state, /* args */)
    })
    .await
    .map_err(|e| format!("Erreur d'exécution : {}", e))?
}

fn ma_commande_longue_blocking(
    app: &AppHandle,
    db: &DbPool,
    /* args */
) -> Result<MonRetour, String> {
    // Tout le code synchrone bloquant ici — sleep, hash, zip, etc.
}
```

Pourquoi pas juste `async fn` sans `spawn_blocking` : le runtime tokio a un pool de tâches limité ; un travail CPU-bound (compression, hash) qui ne `await` jamais sature ce pool et dégrade les autres commandes async. `spawn_blocking` envoie sur un pool dédié au blocking.

Référence : audit Borg `BORG-2026-04-27-001-backup-freeze.md`, sources Tauri v2 [Calling Rust](https://v2.tauri.app/develop/calling-rust/).
```

### 2. Vérifier que la doc reste cohérente

- Le format de tableau est conforme aux autres tableaux du fichier
- Pas d'emoji, français/anglais respecté (commentaires français, identifiants techniques en anglais)
- Bloc de code typé `rust`

## Ordre d'exécution

1. Lire `.claude/rules/rust-backend.md` actuel
2. Insérer la nouvelle section au bon endroit
3. Relire pour cohérence

## Critère de validation

- La nouvelle section est présente après « Commandes Tauri » dans `.claude/rules/rust-backend.md`
- Le pattern est cohérent avec ce qui est implémenté dans `backup.rs`
- Référence vers le log Borg présente
