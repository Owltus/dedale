# BORG-2026-03-24-003 — Phase 10 Dashboard & Planning

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Scan initial + Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC + EXECUTION (correction M1)

## Contexte

Audit Phase 10 : dashboard (1 commande avec ~17 queries d'agregation) + planning (2 commandes calendrier). Phase read-only, pas de CRUD.

## Rapports des drones

### Scan initial
- 17/17 requetes SQL : colonnes et tables verifiees ✓
- 7/7 types TS match Rust ✓
- 3/3 commandes enregistrees ✓
- Declaration : 0 CRITIQUE, 0 HAUTE, 0 MOYENNE

### Six-de-Neuf (Contradicteur)
- "Prochains OT" inclut OT passes non clotures : WHERE manque filtre date
- BETWEEN inclut +1 jour (8 au lieu de 7) : acceptable
- Event planning perdu si date malformee : DB NOT NULL protege
- today non actualise : app desktop acceptable

## Verdict unifie

MOYENNES CORRIGEES : 1
- "Prochains OT" : ajout AND date_prevue >= date('now') pour exclure les OT passes

BASSES acceptees : 3
- BETWEEN 8 jours (acceptable)
- Event parsing (DB protege)
- today session (app desktop)

## Actions executees

1. src-tauri/src/commands/dashboard.rs :
   - Requete "Prochains OT" : ajout filtre date_prevue >= date('now')

2. cargo check : OK
