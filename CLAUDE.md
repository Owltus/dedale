# DÉDALE — Instructions Claude Code

## Projet

Application DÉDALE — GMAO (Gestion de Maintenance Assistée par Ordinateur) desktop.
Mono-utilisateur, full local, aucun serveur distant.
Stack : Tauri v2 (Rust) + React + TypeScript + Tailwind + shadcn/ui + SQLite.

## Documents de référence (lire à la demande, ne pas charger systématiquement)

- PRD-STACK.md — Stack technique et conventions
- PRD-FRONTEND.md — Structure DOM, vues, composants, workflows (62k chars)
- src-tauri/migrations/001_initial_schema.sql — Schéma SQLite baseline (~30 tables, ~40 triggers)
- src-tauri/migrations/NNN_*.sql — Migrations incrémentales (voir section Migrations)
- plan/00-INDEX.md — Plan d'implémentation en 13 phases

## Commandes

```bash
# Dev
npm run tauri dev          # Lance l'app en développement (frontend + backend)
npm run dev                # Frontend seul (Vite)
cargo build                # Backend Rust seul (depuis src-tauri/)

# Build
npm run tauri build        # Build production

# Lint
npx tsc --noEmit           # Type-check TypeScript
```

## Architecture

```
src/                       # Frontend React
├── components/ui/         # shadcn/ui (NE PAS MODIFIER — généré par CLI)
├── components/layout/     # Sidebar, PageHeader, Breadcrumb
├── components/shared/     # DataTable, DocumentsLies, SeuilDisplay...
├── pages/{domaine}/       # 1 dossier par domaine métier
├── hooks/                 # useInvoke, useSystemNotifications...
├── lib/schemas/           # Zod — 1 fichier par domaine
├── lib/types/             # Types TS — 1 fichier par domaine
└── lib/utils/             # formatDate, formatBytes, cn()

src-tauri/src/             # Backend Rust
├── commands/              # 1 fichier par domaine (gammes.rs, contrats.rs...)
├── models/                # 1 fichier par domaine (structs serde)
├── db.rs                  # Connexion SQLite + PRAGMAs + init schema
├── lib.rs                 # Registre modules
└── main.rs                # Tauri Builder + state + invoke_handler
```

## Conventions

### Langue
- Commentaires en **français**
- Noms de variables/fonctions en **anglais** (convention Rust/React)
- Noms de colonnes SQL en **français** (schéma existant, ne pas modifier)

### Séparation des responsabilités
- **Toute logique métier côté Rust** — le frontend ne fait QUE de l'affichage et de la validation de forme
- **Toutes les requêtes SQL sont écrites à la main** — pas d'ORM, pas de query builder
- **TanStack Query pour TOUS les appels `invoke()`** — jamais de `invoke()` nu dans un composant
- **Zod pour TOUTE validation frontend** — les schemas Zod miroir les CHECK SQL
- **shadcn/ui pour TOUS les composants** — voir la table "Composants customs" dans PRD-FRONTEND.md

### Commandes Tauri
- Toutes retournent `Result<T, String>`
- Les erreurs SQLite (y compris `RAISE(ABORT, ...)` des triggers) sont propagées comme `String`
- 1 fichier = 1 domaine dans `commands/` et `models/`

### Frontend
- Types TS dans `lib/types/` — même noms de champs que les structs Rust
- Schemas Zod dans `lib/schemas/` — dériver les types avec `z.infer<typeof schema>`
- Named exports partout (pas de `export default`)
- Composants < 150 lignes — extraire si plus grand

### SQLite
- **Le schéma existe déjà** — ne pas le modifier sans raison
- Les structs Rust doivent refléter le schéma existant
- PRAGMAs obligatoires à chaque connexion (voir `src-tauri/src/db.rs::apply_pragmas`)
- **NE JAMAIS activer `recursive_triggers`**

## Migrations SQL

Toute évolution du schéma passe par un nouveau fichier dans `src-tauri/migrations/`. Le dossier est embarqué dans le binaire (crate `include_dir`) et traité au boot par `db.rs::run_migrations`.

### Règles strictes

- **Nommage** : `NNN_description_courte.sql` où `NNN` est un entier séquentiel à 3 chiffres (`001`, `002`, …). Un trou dans la numérotation fait refuser le boot.
- **Immutabilité** : une fois un fichier distribué (commité et poussé), on ne le modifie plus. Corriger = créer une nouvelle migration qui `DROP … CREATE …` l'objet concerné.
- **Baseline** : `001_initial_schema.sql` = schéma complet installé sur les postes neufs. Les bases créées avant l'introduction du système de migration sont détectées via la présence de `types_erp` et marquées comme « 001 appliquée » sans ré-exécution.
- **Idempotence pratique** : chaque migration doit pouvoir s'exécuter sur la baseline courante. Pour un trigger : `DROP TRIGGER IF EXISTS nom; CREATE TRIGGER nom …`. Pour une colonne ajoutée : `ALTER TABLE … ADD COLUMN …`.
- **Transaction par migration** : `db.rs` wrap chaque fichier dans `BEGIN IMMEDIATE` / `COMMIT`. Échec ⇒ `ROLLBACK` + refus de démarrer.
- **Backup automatique** : un fichier `dedale.db.backup-YYYYMMDD-HHMMSS` est créé avant d'appliquer une ou plusieurs migrations sur une base existante.

### Workflow côté dev

1. Créer `src-tauri/migrations/NNN_description.sql` (numéro suivant).
2. Écrire le SQL (`DROP IF EXISTS` + `CREATE`, ou `ALTER TABLE`, etc.).
3. Relancer `npm run tauri dev` — la migration s'applique automatiquement sur la base locale.
4. **Ne jamais** éditer une migration précédente. Ne jamais renuméroter.

### Table de suivi

`schema_migrations (version INTEGER PK, name TEXT, applied_at TEXT)` — créée automatiquement, stocke l'historique appliqué.
