# BORG-2026-03-23-006 — Phase 5 Prestataires & Contrats

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Sept-de-Neuf + Quatre-de-Cinq (combines), Six-de-Neuf
> Mode : DIAGNOSTIC + EXECUTION (correction HAUTE)

## Contexte

Audit Phase 5 : prestataires (5 cmds) + contrats (11 cmds avec versioning, avenants, resiliation, statut calcule). ~570 LOC Rust + ~350 LOC TS frontend.

## Rapports des drones

### Sept-de-Neuf + Quatre-de-Cinq (combines)
- Colonnes SQL : ZERO mismatch (17/17 contrats, 8/8 prestataires) ✓
- 7 trouvailles (1 CRITIQUE, 2 HAUTE, 2 MOYENNE, 2 BASSE)
- CRITIQUE : resilier_contrat sans pre-check est_archive
- HAUTE : date comparison strings, get_contrat_versions sans date_resiliation
- MOYENNE : id_prestataire=1 filter frontend-only, types_contrats naming

### Six-de-Neuf (Contradicteur)
- 2 faux positifs elimines :
  - id_prestataire=1 → design intentionnel (contrat systeme existe en reference data)
  - types_contrats "Indetermine" → mismatch inexistant
- Confirme HAUTE get_contrat_versions comme BUG AVERE
- Downgrade CRITIQUE resilier_contrat a MOYENNE (trigger message est francais et clair)
- Downgrade HAUTE dates a MOYENNE (YYYY-MM-DD safe via frontend+chrono)

## Verdict unifie

CRITIQUES : 0
HAUTES CORRIGEES : 1
- get_contrat_versions : ajout date_resiliation au CTE + passage a calculer_statut_contrat
  → statut "Resilie" desormais visible dans l'historique des avenants

MOYENNES acceptees : 2
- resilier_contrat sans pre-check (trigger protege, message clair)
- Date string comparison (YYYY-MM-DD garanti par frontend + chrono)

BASSES acceptees : 2
- form.watch() anti-pattern
- ContratsDetail skeleton sans boutons action

FAUX POSITIFS : 2

## Actions executees

1. src-tauri/src/commands/contrats.rs :
   - get_contrat_versions CTE : ajout c.date_resiliation dans le SELECT
   - Mapping : date_resiliation lue depuis row.get(7) et passee a calculer_statut_contrat
   - Resultat : statut "Resilie" correctement calcule dans la chaine de versions

2. cargo check : OK
