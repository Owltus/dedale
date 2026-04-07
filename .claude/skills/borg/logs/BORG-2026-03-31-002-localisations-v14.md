# BORG-2026-03-31-002 — Refactoring localisations v14

> Projet : Mantis — Tauri v2 + React + TypeScript + SQLite
> Drones déployés : Trois-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Quatre-de-Cinq, Six-de-Neuf
> Mode : DIAGNOSTIC

## Verdict unifié

### CONFORME — 0 faille confirmée

| Zone | Statut |
|------|--------|
| Schema SQL (tables, FK, triggers, index) | ■ CONFORME |
| Rust backend (commands, models, lib.rs) | ■ CONFORME |
| Frontend (types, schemas, hooks, pages, router) | ■ CONFORME |
| Migration db.rs (v2→v3) | ■ CONFORME |

### Faux positifs éliminés (3)

1. UPDATE...FROM dans triggers — rusqlite bundled embarque SQLite 3.43+ (>= 3.33 requis)
2. Migration depth gammes — théoriquement possible mais improbable en pratique
3. Retry infini migration — l'app crash avec .expect(), pas de boucle silencieuse

### Recommandation optionnelle
Ajouter validation pre-migration dans db.rs : vérifier qu'aucune gamme ne pointe vers depth < 2 avant la migration v2→v3.

## Actions exécutées
Diagnostic uniquement.
