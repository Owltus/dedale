# Étape 2 — Système de migration (db.rs)

## Objectif
Permettre aux bases existantes (v1) de migrer automatiquement vers le nouveau schéma (v2) au démarrage de l'application.

## Fichier impacté
- `src-tauri/src/db.rs`

## Travail à réaliser

### 1. Ajouter une détection de version
```rust
// Vérifier si domaines_gammes existe
// Si oui → schéma v2, rien à faire
// Si non → base v1, lancer la migration
fn detect_schema_version(conn: &Connection) -> Result<u32, String> {
    let has_domaines_gammes: bool = conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='domaines_gammes'",
        [], |row| row.get::<_, i64>(0),
    ).map_err(|e| e.to_string())? > 0;

    if has_domaines_gammes { Ok(2) } else { Ok(1) }
}
```

### 2. Écrire le script de migration v1 → v2

Le script doit être exécuté dans une **transaction unique** et doit :

1. `PRAGMA foreign_keys = OFF;`
2. Créer `domaines_gammes`, `familles_gammes`, `gammes_equipements`
3. Copier domaines/familles utilisés par les gammes existantes
4. Migrer liens `gammes.id_equipement` vers `gammes_equipements`
5. Recréer `gammes` sans `id_famille`/`id_equipement`, avec `id_famille_gamme`
6. `ALTER TABLE domaines_techniques RENAME TO domaines_equipements;`
7. Drop + Recreate tous les triggers impactés (~20 triggers)
8. Drop + Recreate les index impactés
9. `PRAGMA foreign_key_check;` → vérifier 0 violation
10. `PRAGMA foreign_keys = ON;`

### 3. Intégrer dans `init_database()`
```rust
pub fn init_database(app_data_dir: PathBuf) -> Result<DbPool, String> {
    // ... (ouverture connexion, pragmas)

    // Schéma vide → init complète
    init_schema_if_empty(&conn)?;

    // Base existante → migration si nécessaire
    migrate_if_needed(&conn)?;

    Ok(Mutex::new(conn))
}
```

## Points d'attention
- La migration doit être **idempotente** (relancer ne casse rien)
- Les IDs doivent être préservés (gammes existantes gardent leur id_gamme)
- Les OT existants ne sont PAS modifiés (snapshots historiques conservés)
- `sqlite_sequence` doit être mis à jour pour les nouvelles tables

## Critère de validation
- `cargo build` compile sans erreur
- Avec une base v1 existante : l'app démarre et la migration s'exécute
- Avec une base vide : le schéma v2 est créé directement
- `PRAGMA foreign_key_check` retourne 0 violation après migration

## Contrôle /borg
Lancer un /borg pour vérifier :
- Le script de migration est complet (pas de table/trigger oublié)
- Les données existantes sont préservées
- Pas de conflit d'ID entre tables migrées et nouvelles
