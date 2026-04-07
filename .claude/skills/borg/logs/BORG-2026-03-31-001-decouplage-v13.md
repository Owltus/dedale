# BORG-2026-03-31-001 — Découplage gammes/équipements v13

> Projet : GMAO Desktop — Tauri v2 + React + TypeScript + SQLite
> Drones déployés : Trois-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Quatre-de-Cinq, Six-de-Neuf
> Mode : DIAGNOSTIC + EXÉCUTION (1 fix appliqué)

## Verdict unifié

### FAILLES CONFIRMÉES

**□ CRITIQUE — Bug PRAGMA foreign_key_check (db.rs:142)**
`query_row("PRAGMA foreign_key_check", ...).unwrap_or(0)` masquait les violations FK.
`PRAGMA foreign_key_check` retourne des lignes (table, rowid, parent, fkid), pas un compteur.
Si violations présentes → type mismatch TEXT→i64 → unwrap_or(0) → faux négatif silencieux.
**FIX APPLIQUÉ** : remplacé par `SELECT COUNT(*) FROM pragma_foreign_key_check()`.

### FAUX POSITIFS ÉLIMINÉS

**6 failles camelCase (Drone 4) → TOUS FAUX POSITIFS**
Tauri v2 `#[tauri::command]` macro convertit automatiquement camelCase JS → snake_case Rust.
Les hooks pré-existants (useFamilles, useEquipements, etc.) utilisent le même pattern et fonctionnent.
Confirmé par : les hooks `useFamilles(idDomaine)` → Rust `get_familles(id_domaine)` fonctionnaient avant v13.

### CONFORMITÉ

| Zone | Statut |
|------|--------|
| Schema SQL (tables, FK, CHECK) | ■ CONFORME |
| 6 triggers réécrits | ■ CONFORME |
| 0 triggers résiduels ancien modèle | ■ CONFORME |
| Models Rust ↔ schema.sql | ■ CONFORME |
| Types TS ↔ structs Rust | ■ CONFORME |
| Schemas Zod ↔ CHECK SQL | ■ CONFORME |
| Hooks TanStack Query | ■ CONFORME |
| Commandes Tauri ↔ lib.rs | ■ CONFORME (29 commandes gammes) |
| Migration v1→v2 (db.rs) | ■ CONFORME (après fix FK check) |
| Aucune ref domaines_techniques dans code | ■ CONFORME |
| Aucune ref gammes.id_famille/id_equipement | ■ CONFORME |

### DÉVIATIONS MINEURES (non bloquantes)

- 8 usages `format!()` pour colonnes SELECT dans gammes.rs (sûr, pattern pré-existant dans tout le projet)

## Actions exécutées

1. Fix db.rs:142 — PRAGMA foreign_key_check → SELECT COUNT(*) FROM pragma_foreign_key_check()
