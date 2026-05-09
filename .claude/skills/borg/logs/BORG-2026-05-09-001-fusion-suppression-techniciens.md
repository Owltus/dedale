# BORG-2026-05-09-001 — Audit post-fusion + suppression techniciens

> Projet : DÉDALE (GMAO Tauri v2 + React + TS + SQLite, mono-utilisateur)
> Drones déployés : Trois-de-Cinq (Cartographe), Sept-de-Neuf (Conformité), Deux-de-Cinq (Résilience), Quatre-de-Cinq (Failles), Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC

## Cible

Audit complet post-fusion :
- 6 migrations SQL fusionnées en un seul `001_initial_schema.sql` (3218 lignes)
- Feature "techniciens" supprimée intégralement (tables `techniciens`/`postes`/`documents_techniciens`, colonnes `ordres_travail.id_technicien`/`nom_technicien`/`nom_poste`, FK, ~15 triggers, ~30 fichiers Rust/TS)
- DB locale nettoyée (`DELETE FROM schema_migrations WHERE version > 1` + `VACUUM`)

Vérifier : cohérence SQL/Rust/React, intégrité du schéma fusionné, références orphelines, cohérence des triggers, robustesse globale.

---

## CONTEXTE D'ASSIMILATION

- **Projet** : DÉDALE GMAO desktop, mono-utilisateur, full local. Stack : Tauri v2 (Rust) + React + TypeScript + Tailwind + shadcn/ui + SQLite.
- **Standards documentés** : `CLAUDE.md`, `.claude/rules/{sqlite,rust-backend,react-typescript,shared-components,tailwind,shadcn-ui,forms-validation,tanstack-query}.md`, `PRD-FRONTEND.md`, `PRD-STACK.md`.
- **Tests existants** : aucun framework de test formel — projet en phase de développement solo.
- **Audits précédents** : 28 logs Borg antérieurs, derniers en date sur `mesurecell-delta` (2026-05-01), `page-releves` (2026-04-29), `statuts-gammes` (2026-04-28). Aucun antécédent sur la fusion ou la suppression techniciens — audit nouveau.

---

## Rapports des drones

### Drone 1 — Trois-de-Cinq (Cartographie)

**INVENTAIRE FACTUEL POST-FUSION**
- SQL : 51 tables, 74 triggers, 96 index, 14 INSERT de référence dans `001_initial_schema.sql` (3218 lignes)
- Rust : 16 modules commands, 15 modules models, 119 commandes Tauri enregistrées dans `lib.rs`, 7990 lignes Rust
- React : 23 pages routées, 44 composants, 22 hooks de domaine, 9 schemas Zod, 22072 lignes TS/TSX

**Sections du DDL (post-fusion)** :
1. Header + PRAGMAs (recursive_triggers DÉSACTIVÉ intentionnellement)
2. Référentiels ERP + établissement (3 tables)
3. Média centralisée (images)
4. Unités, périodicités, sources, opérations (4 tables)
5. DI + liaisons N↔N (di_gammes, di_localisations, di_equipements) — 5 tables
6. Documents + 7 tables de liaison multi-entités
7. Contractuel (prestataires, types_contrats, contrats versionnés, contrats_gammes) — 4 tables
8. Localisations 3 niveaux fixes (batiments > niveaux > locaux)
9. Modèles équipements + champs + valeurs + équipements (9 tables)
10. Domaines/familles gammes + modèles opérations + gammes + gamme_modeles + gammes_equipements (8 tables)
11. Statuts + priorités + ordres_travail + operations_execution + parametres_systeme (6 tables)

**Nettoyage post-suppression confirmé** :
- Tables supprimées : `techniciens`, `postes`, `documents_techniciens` ✓
- Colonnes supprimées : `ordres_travail.id_technicien`, `nom_technicien`, `nom_poste` ✓
- FK et triggers correspondants supprimés ✓

**Hub de complexité** : `ordres_travail.rs` (572L) — `OT_COLS` (24 cols) + `OP_EXEC_COLS` (16 cols) hardcodés, fonctions `row_to_ot`/`row_to_op_exec` couplent indices 0..23/0..15 à l'ordre des SELECT. Helpers réutilisés par dashboard, planning, gammes.

**Top 5 fichiers Rust > 500L** : backup.rs (1000L), documents.rs (982L), gammes.rs (960L), equipements.rs (628L), dashboard.rs (584L), ordres_travail.rs (572L).

**Top 5 pages React > 300L** : prestataires/[id].tsx (700L), gammes/[id].tsx (482L), UploadModal.tsx (405L), planning/index.tsx (381L), ContratsTimeline.tsx (343L).

**Couplages à risque identifiés** :
- SQL ↔ Rust : `row_to_ot` indices vs ordre DDL (fragile post-refactoring)
- Rust ↔ React : commandes OT retournent 2 structs séparés assemblés côté frontend
- Schemas Zod : ne couvrent pas tous les CHECK SQL (validation côté Rust seulement)

### Drone 2 — Sept-de-Neuf (Conformité)

**Conformité globale : 89%** — 11/15 règles complètes, 4 déviations confirmées.

**Tableau synthétique** :

| Règle | Statut | Preuve |
|---|---|---|
| Migrations SQL | ■ | 1 seul 001 ; en-tête + PRAGMAs ; triggers idempotents (`DROP IF EXISTS`) |
| Pragmas SQLite | ■ | `db.rs:248-254` — `foreign_keys=ON`, WAL, recursive_triggers jamais activé |
| Booléens i64 | ◧ | 2 fichiers : `dashboard.rs:56-62` utilise `bool` |
| SQL paramétré | ■ | 83 `prepare_cached`, `params![]` systématique, aucun `format!()` SQL |
| Modèles Serde | ■ | `Serialize/Deserialize`, `Option<T>` pour nullable |
| Result<T, String> | ■ | 100% des commandes |
| React Named Exports | ■ | Aucun `export default` |
| invoke() wrapper | □ CRITIQUE | `prestataires/[id].tsx:372` `invoke("save_document_to", ...)` nu |
| Composants < 150L | ◧ | 7 fichiers > 150L |
| Props : interface | ■ | Convention respectée |
| TypeScript no-any | ■ | Aucun `any` détecté |
| Zod + zodResolver | ■ | `typedResolver()` wrapper légitime |
| TanStack Query | ■ | `onSettled`, `enabled`, queryKey hiérarchiques |
| Composants partagés | □ CRITIQUE | `OtOperationsTable.tsx:175` `<table>` brut |
| Shadcn Select | ■ | Usage correct `items=` prop |

**Déviations détaillées** :

1. **CRITIQUE** — `prestataires/[id].tsx:372` : `await invoke("save_document_to", ...)` nu dans event handler. Auto-défense : "I/O sans cache". Réfutation : autres I/O documents passent par `useInvokeMutation`, cohérence requise.
2. **CRITIQUE** — `OtOperationsTable.tsx:175` : `<table className="w-full text-sm">` au lieu de `InlineTable`/`@tanstack/react-table`. Auto-défense : mode édition draft complexe. Réfutation : Table shadcn supporte le custom content.
3. **MOYENNE** — `dashboard.rs:56-62` : 7 champs `pub has_*: bool` au lieu de `i64`. Données d'onboarding calculées (pas mapping SQL).
4. **HAUTE** — 7 composants > 150L (prestataires/[id].tsx 700L, etc.). Pages détail GMAO denses, refactoring en sous-composants recommandé.
5. **MOYENNE** — `gammes/index.tsx:64-66` : Form error display manuel au lieu du pattern shadcn complet (`FormField`/`FormMessage`).

### Drone 3 — Deux-de-Cinq (Résilience)

**État global : FRAGILE en périphérie, SOLIDE au cœur**.

**Trous identifiés** :

| # | Sévérité | Localisation | Problème |
|---|---|---|---|
| 1 | CRITIQUE | `src-tauri/seed.sql:802+` | INSERT INTO ordres_travail mentionne `id_technicien` (col supprimée). Échec SQL silencieux si exécuté. |
| 2 | HAUTE | `commands/ordres_travail.rs:15-65` | `OT_COLS` (24 cols) ↔ `row_to_ot` indices 0..23. Aucune validation à la compilation. Réorganisation accidentelle = mapping cassé silencieusement. |
| 3 | HAUTE | `001_initial_schema.sql:1110-1135` | `protection_ot_terminaux` ne protège pas `nom_equipement` après modification de `gammes_equipements` post-clôture. |
| 4 | MOYENNE-HAUTE | trigger `gestion_statut_ot:1880-1910` | COALESCE date_cloture = today si toutes ops en statut N/A → traces auditées potentiellement trompeuses. |
| 5 | MOYENNE | système migrations | Si seed échoue, pas de fallback → base vide au boot, interface figée. |

**Tests/validations manquants P0** :
- Synchroniser seed.sql ↔ DDL
- Test régression OT_COLS (count check ou named columns)
- Test cohérence post-clôture OT (modification gammes_equipements)

**Score résilience** : 🟡 FRAGILE après fusion. Forces : schéma SQL bien structuré, transactions correctes, documents bien gérés. Faiblesses : seed invalide, mapping par indices, edge cases triggers, pas de tests automatisés.

### Drone 4 — Quatre-de-Cinq (Failles)

**Failles confirmées** :

| # | Sévérité | Localisation | Faille |
|---|---|---|---|
| 1 | CRITIQUE | `src-tauri/seed.sql:176, 802-948` | INSERT INTO `techniciens` (table supprimée) + 27 INSERT INTO `ordres_travail` avec `id_technicien` (col supprimée) |
| 2 | CRITIQUE | `commands/backup.rs::validate_pending_db` | Restauration backup v5 sur app v1 — colonnes fantômes restent + données technicien perdues silencieusement |
| 3 | MOYENNE | `commands/backup.rs::validate_pending_db` | Validation restauration ne vérifie pas la liste des colonnes attendues |
| 4 | HAUTE | système migrations | DB ancienne avec `applied=[1..5]` → fusion peut masquer la 006 |
| 5 | BASSE | `src/lib/schemas/referentiels.ts` | Commentaire orphelin "postes : lecture seule" |

**Bugs antérieurs identifiés (déjà corrigés)** : MesureCell Δ (BORG-2026-05-01-001), Cascade statuts gammes (BORG-2026-04-28-001).

### Drone 5 — Six-de-Neuf (Contradicteur)

**PARTIE A — Contradiction des rapports** :

| Trouvaille | Verdict | Détail |
|---|---|---|
| D2.1 invoke() nu prestataires/[id].tsx:372 | **RÉFUTÉ** | Vérifié ligne 372, `save_document_to` sans wrapper, autres commandes documents wrappées. Cohérence violée. |
| D2.2 `<table>` brut OtOperationsTable.tsx:175 | **RÉFUTÉ** | Confirmé, mode draft ne justifie pas l'exception. |
| D2.3 `bool` dashboard.rs | **VALIDE (faux positif)** | Données calculées en mémoire (`COUNT(*) > 0`), pas mappées SQLite. `bool` approprié. |
| D3.1/D4.1 seed.sql avec id_technicien | **RÉFUTÉ** | Confirmé, fichier `src-tauri/seed.sql` (83 Ko) contient INSERT obsolètes. |
| D3.3 protection_ot_terminaux + nom_equipement | **VALIDE (faux positif)** | Vérification du trigger : `nom_equipement` EST dans la blacklist (ligne 1131). |
| D3.4 COALESCE date_cloture | **NUANCÉ** | Sémantiquement correct mais peut confondre l'audit. |
| D3.2 OT_COLS fragile | **VALIDE (faux positif)** | Convention rusqlite standard acceptée. |
| D4.2/D4.4 Restauration backup ancien | **VALIDE (faux positif)** | `validate_pending_db` rejette correctement (`max_version=6 > embedded=1` → REJECT). |
| D4.5 Commentaire orphelin Zod | **RÉFUTÉ** | Confirmé : `referentiels.ts:6` mentionne "postes" obsolète. |

**PARTIE B — Angles morts (trouvailles propres du Contradicteur)** :

1. **CRITIQUE** — `src-tauri/seed.sql` orphelin : aucune référence depuis le code Rust ou Cargo.toml. Fichier de dev manuel, jamais auto-exécuté, mais piège pour qui le lance.
2. **MOYENNE** — `db.rs::bootstrap_legacy_if_needed` : edge case avec `schema_migrations = [1]` + `types_erp` présent → re-bootstrap potentiel. Mitigé par UNIQUE constraint, design fragile.
3. **MOYENNE** — `save_document_to` sans wrapper : impact réel = pas de retry automatique, pas de loading state structuré.
4. **BASSE** — `PRD-FRONTEND.md:1428` : référence Zod orpheline à `postes`.

**Bilan** : 3 faux positifs éliminés, 5 failles confirmées, 4 trouvailles ajoutées.

---

## Verdict unifié

### CRITIQUE — À résoudre avant tout

| # | Localisation | Action |
|---|---|---|
| 1 | `src-tauri/seed.sql` | Régénérer ou supprimer. Orphelin de dev. |
| 2 | `src/pages/ordres-travail/OtOperationsTable.tsx:175` | Remplacer `<table>` par TanStack Table + Table shadcn/ui |
| 3 | `src/pages/prestataires/[id].tsx:372` | Encapsuler `save_document_to` dans `useInvokeMutation` |

### HAUTE — À planifier

| # | Localisation | Problème |
|---|---|---|
| 4 | 7 pages > 150L | Refactoring en sous-composants/hooks custom |
| 5 | `db.rs::bootstrap_legacy_if_needed` | Edge case partiel bootstrap, design fragile mais sûr |

### MOYENNE — À adresser quand opportun

| # | Localisation | Problème |
|---|---|---|
| 6 | trigger `gestion_statut_ot` | Sémantique COALESCE date_cloture |
| 7 | `gammes/index.tsx:64-66` | Pattern FormField shadcn complet |

### BASSE — Cosmétique

| # | Localisation |
|---|---|
| 8 | `src/lib/schemas/referentiels.ts:6` (commentaire orphelin "postes") |
| 9 | `PRD-FRONTEND.md:1428` (référence Zod orpheline) |

### Auto-critique du Collectif

Le Collectif a manqué `src-tauri/seed.sql` lors de la Phase 1 d'assimilation. Le fichier de 83 Ko, présent depuis avril, n'a pas été identifié comme zone à scanner. Les drones D3 et D4 l'ont découvert indépendamment. Les futures assimilations devront grep tous les `*.sql` à la racine de `src-tauri/`, pas seulement le dossier `migrations/`.

### État global

**OPÉRATIONNEL avec 3 actions CRITIQUES requises**.

Le code source actif (Rust compile, React compile, app boote, DB nettoyée) ne contient AUCUNE référence orpheline aux entités supprimées. La fusion des migrations est SÉMANTIQUEMENT CORRECTE — le SQL produit la même structure que la chaîne 001+002+003+004+006 appliquée à une DB vierge.

Les 3 actions CRITIQUES portent toutes sur des artefacts périphériques (seed.sql) ou des violations préexistantes de règles (table HTML, invoke nu) qui ne sont PAS introduites par la fusion mais simplement révélées par l'audit.

## Actions exécutées

Diagnostic uniquement. Aucune modification du code par le Collectif. L'espèce 5618 décide de la suite.
