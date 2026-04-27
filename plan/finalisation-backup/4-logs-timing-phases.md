# Étape 4 — Logs de timing par phase

## Objectif

Instrumenter `backup_create_blocking` avec des `log::info!` pour mesurer la durée de chaque phase. Permet un diagnostic futur de performance sans devoir relancer un audit Borg complet — il suffira de lire le fichier de log dans `LogDir`.

## Contexte

Le plugin `tauri-plugin-log` est activé en release (cible `LogDir`, niveau `Warn`) — voir `lib.rs:34-58`. Les `log::info!` ne sortiront PAS en release par défaut (level Warn) mais sortiront en debug (level Info).

Pour qu'ils soient utiles en production, il faut soit baisser le niveau à `Info` en release, soit utiliser `log::warn!` ce qui pollue les logs warning. Décision recommandée : passer au niveau `Info` en release, parce que ces logs sont déjà rares (1 backup = 7 lignes).

## Fichier(s) impacté(s)

- `src-tauri/src/lib.rs` (passer le niveau de log release de `Warn` à `Info`)
- `src-tauri/src/commands/backup.rs`

## Travail à réaliser

### 1. Passer le niveau de log release à Info

Dans `src-tauri/src/lib.rs`, ligne ~50 :

```rust
} else {
    tauri_plugin_log::Builder::default()
        .target(tauri_plugin_log::Target::new(
            tauri_plugin_log::TargetKind::LogDir { file_name: None },
        ))
        .level(log::LevelFilter::Info)  // était Warn
};
```

### 2. Instrumenter `backup_create_blocking` dans `src-tauri/src/commands/backup.rs`

Ajouter un `Instant` global à l'entrée de la fonction, et un `log::info!` à chaque transition de phase :

```rust
fn backup_create_blocking(
    app: &AppHandle,
    db: &DbPool,
    destination_path: String,
) -> Result<BackupInfo, String> {
    let started = Instant::now();
    log::info!("backup: démarrage vers {}", destination_path);

    // ... après assert_integrity_ok + read_schema_version
    log::info!("backup: intégrité + version OK ({} ms)", started.elapsed().as_millis());

    // ... après snapshot_database
    let after_snapshot = Instant::now();
    log::info!("backup: snapshot terminé ({} ms cumulés)", started.elapsed().as_millis());

    // ... après sha256_of_file
    log::info!("backup: hash SHA-256 calculé (+{} ms)", after_snapshot.elapsed().as_millis());

    // ... après read_snapshot_stats
    log::info!("backup: stats lues ({} OT, {} gammes, {} équipements)", stats.ot_count, stats.gammes_count, stats.equipements_count);

    // ... après add_dir_to_zip
    log::info!("backup: documents compressés ({} fichiers)", total_docs);

    // ... après zip.finish
    log::info!("backup: archive finalisée ({} octets)", total_size);

    // ... après persistance derniere_sauvegarde
    log::info!("backup: terminé en {} ms", started.elapsed().as_millis());
}
```

Adapter les emplacements précis selon les lignes effectives de la fonction (qui auront pu bouger après l'étape 2).

### 3. Idem pour `backup_restore_blocking` et `restore_pre_restore_blocking`

Logs équivalents pour ces deux fonctions :

```rust
log::info!("restore: démarrage depuis {}", zip_path);
log::info!("restore: archive validée ({} ms)", started.elapsed().as_millis());
log::info!("restore: extraction terminée ({} ms)", started.elapsed().as_millis());
log::info!("restore: hash vérifié, redémarrage");
```

## Ordre d'exécution

1. Modifier le niveau de log dans `lib.rs`
2. Ajouter les `Instant::now()` et `log::info!` dans les 3 fonctions blocking
3. `cargo check`
4. Vérifier en mode debug : un backup produit bien les 7 lignes de log

## Critère de validation

- `cargo check` propre
- En mode dev (debug), un `backup_create` génère 7 lignes `log::info!` dans la stdout
- Le format est cohérent : préfixe `backup:` ou `restore:` selon la commande, durée en `ms`
