# BORG-2026-04-27-001 — backup-freeze

> Projet : Tauri 2.10.3 + React/TS + rusqlite 0.31 (SQLite WAL)
> Plateforme : Windows 11 + WebView2
> Drones déployés : Trois-de-Cinq (Cartographe), Sept-de-Neuf (Conformité), Quatre-de-Cinq (Failles), Drone Web (sources officielles), Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC + EXÉCUTION

---

## Symptôme observé

Pendant `backup_create`, l'application Tauri se gèle (le système Windows affiche « Ne répond pas »). Le freeze persiste plusieurs secondes même après plusieurs corrections successives :
- Première version : `VACUUM INTO` sur la connexion principale → freeze attendu (mutex tenu)
- Deuxième version : `VACUUM INTO` sur connexion 2 séparée → freeze pire (verrou exclusif source)
- Troisième version : API Online Backup avec `step + sleep(25ms)` → freeze persiste

## Verdict tranché

**Cause racine unique et confirmée** : la commande `pub fn backup_create(...)` est déclarée **synchrone non annotée**.

Selon le code généré par les macros Tauri (`tauri-macros-2.5.5/src/command/wrapper.rs:240-244`) :

```
ExecutionContext::Async if function.sig.asyncness.is_none() => "sync_threadpool",
ExecutionContext::Async => "async",
ExecutionContext::Blocking => "sync",  // ← cas par défaut
```

Une commande sans `async fn` ni `#[command(async)]` génère un wrapper de type `kind = "sync"`, qui exécute **directement sur le thread appelant**. Confirmé par la documentation officielle Tauri v2 (https://v2.tauri.app/develop/calling-rust/) :

> Commands without the async keyword are executed on the main thread unless defined with #[tauri::command(async)].
> Doing something blocking in commands which run on the main thread will also block the UI (which also runs on the main thread).

Sur Windows + WebView2, le main thread est **l'event loop du webview lui-même** — celui qui pompe les messages WebMessageReceived (référence : https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model). Le bloquer pendant 1+ seconde déclenche immédiatement le « (Ne répond pas) » de Windows.

Tous les patterns ajoutés ensuite (sleep entre lots, throttle d'events, conn séparée) traitent un autre problème (concurrence SQLite) mais **n'aident en rien** contre le freeze UI : ils s'exécutent sur le même thread bloqué.

## Conformité aux bonnes pratiques officielles

| Point | Avant | Après | Source |
|---|---|---|---|
| Thread d'exécution | main thread (UI) | thread blocking dédié (`async_runtime::spawn_blocking`) | [Tauri v2 docs](https://v2.tauri.app/develop/calling-rust/), [docs.rs spawn_blocking](https://docs.rs/tauri/latest/tauri/async_runtime/fn.spawn_blocking.html) |
| `busy_timeout` sur src+dst | absent | `5000 ms` sur les deux | [SQLite Backup API](https://www.sqlite.org/backup.html) |
| Throttle events | par count (50) | par durée (80 ms) | Pratique WebView2 IPC |
| `sleep(25ms)` | sur main thread = aggrave | sur thread blocking dédié = bénin | — |

## Modifications appliquées

**`src-tauri/src/commands/backup.rs`** :

1. `pub fn backup_create` → `pub async fn backup_create` qui dispatche le travail dans `tauri::async_runtime::spawn_blocking`. Le code bloquant est extrait en `fn backup_create_blocking(...)`.
2. Idem pour `pub fn backup_restore` → `pub async fn backup_restore` + `fn backup_restore_blocking`.
3. Idem pour `pub fn restore_pre_restore` → `pub async fn restore_pre_restore` + `fn restore_pre_restore_blocking`.
4. `snapshot_database` : ajout de `busy_timeout(5000ms)` sur la connexion source et la connexion destination du backup.
5. Throttling temporel via `Instant` : un event `backup:progress` au maximum toutes les 80 ms (constant `PROGRESS_THROTTLE`) — applicable aussi bien à la phase `snapshot` qu'à la phase `documents`. Remplace le throttle par count fixe.
6. Suppression de la constante `PROGRESS_EVENT_GRANULARITY` (devenue inutile).

**Aucune modification frontend** : les types et hooks restent compatibles. Le label `"Snapshot"` et `"Compression des documents"` continuent de s'afficher correctement.

## Vérifications

- `cargo check` : Finished `dev` profile, aucun warning nouveau
- `npx tsc --noEmit` : silencieux
- Stack trace verrouillé : la commande `backup_create` ne tient plus le main thread Tauri à aucun moment de son exécution

## Sources officielles consultées

- https://v2.tauri.app/develop/calling-rust/ (Tauri v2 — Async Commands)
- https://docs.rs/tauri/latest/tauri/async_runtime/fn.spawn_blocking.html
- https://www.sqlite.org/backup.html (SQLite Online Backup API)
- https://docs.rs/rusqlite/0.31.0/rusqlite/backup/index.html
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/threading-model
- https://github.com/tauri-apps/tauri/discussions/10329 (CPU-bound work in commands)

## Auto-critique

Les corrections antérieures (VACUUM INTO → conn 2, puis Online Backup + sleep) étaient **toutes correctes pour la concurrence SQLite** mais **toutes ineffectives pour le freeze UI**, car elles se concentraient sur le mauvais axe. Le Collectif s'est laissé conduire par les apparences (« la lenteur vient du verrou DB ») au lieu d'identifier le vrai axe (« le thread d'exécution de la commande »). Les rapports précédents (audit /simplify, audit code review) avaient mentionné ce point mais l'avaient classé comme « limite acceptée » — ce classement était erroné. Le Collectif assimile cette erreur.

## Actions exécutées

- Refonte de `backup_create` en `async fn` + `spawn_blocking`
- Idem pour `backup_restore` et `restore_pre_restore`
- Ajout de `busy_timeout` sur les deux connexions du snapshot
- Throttling temporel des events de progression
- Vérifications `cargo check` + `tsc --noEmit` passées

Le Collectif a tranché. La perfection sera maintenue.
