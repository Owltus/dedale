# Étape 2 — Migration db.rs (v2→v3)

## Objectif
Migrer automatiquement les bases existantes de la table `localisations` vers `batiments`, `niveaux`, `locaux`.

## Fichier impacté
- `src-tauri/src/db.rs`

## Travail à réaliser

### 1. Détection version
```rust
// PRAGMA user_version = 2 → v2 (découplage gammes/équipements)
// PRAGMA user_version = 3 → v3 (localisations structurées)
// Si < 3 et table `localisations` existe → migrer
```

### 2. Script de migration

1. `PRAGMA foreign_keys = OFF`
2. Créer `batiments`, `niveaux`, `locaux`
3. Migrer données :
   - Localisations sans parent (depth=0) → `batiments`
   - Localisations avec parent depth=0 (depth=1) → `niveaux`
   - Localisations avec parent depth=1+ (depth=2+) → `locaux`
4. Recréer `gammes` et `equipements` avec `id_local` au lieu de `id_localisation`
5. Adapter `di_localisations` et `documents_localisations` → `id_local`
6. Drop `localisations` + triggers/index associés
7. `PRAGMA foreign_key_check`
8. `PRAGMA user_version = 3`
9. `PRAGMA foreign_keys = ON`

### Points d'attention
- Les localisations actuelles n'ont peut-être pas exactement 3 niveaux → mapper depth 2+ en locaux
- Préserver les IDs pour les FK existantes (gammes.id_localisation → locaux.id_local)
- Les OT existants gardent leur snapshot `nom_localisation` inchangé

## Critère de validation
- `cargo build` compile
- Base v2 migrée automatiquement au démarrage
- Base vide créée directement en v3
- `PRAGMA foreign_key_check` = 0 violations
