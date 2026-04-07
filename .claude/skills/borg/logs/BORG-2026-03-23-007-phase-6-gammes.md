# BORG-2026-03-23-007 — Phase 6 Gammes de maintenance

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Scan initial + Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC + EXECUTION (corrections C1 + H1)

## Contexte

Audit Phase 6 : gammes, operations, gammes_types, gamme_type_items, gamme_modeles. 22 commandes Rust, 5 tables, 52 colonnes SQL.

## Rapports des drones

### Scan initial
- 52/52 colonnes SQL : ZERO mismatch
- 22/22 queries : CORRECT
- 4/4 schemas Zod : CORRECT
- Declaration : 0 CRITIQUE, 0 HAUTE

### Six-de-Neuf (Contradicteur) — FAUX NEGATIF SYSTEMIQUE
Le Contradicteur a invalide le verdict initial :
- CRITIQUE trouvee : useGammeModeles declare GammeType[] mais retourne i64[] (runtime crash)
- HAUTE trouvee : route /gammes/new inexistante, bouton navigue vers /:id="new" → useGamme(NaN)
- MOYENNE trouvee : update_operation permet changer id_gamme, trigger ne propage pas
- MOYENNE : page detail gamme read-only, IDs bruts affiches

## Verdict unifie

CRITIQUES CORRIGEES : 1
- useGammeModeles : type corrige de GammeType[] → number[]
- Import GammeType retire (unused)

HAUTES CORRIGEES : 1
- Bouton "Nouvelle gamme" retire (naviguait vers /gammes/new inexistant)
- Imports Plus, Button nettoyes

MOYENNES acceptees : 2
- update_operation id_gamme modifiable (UI ne propose pas le changement)
- Page detail gamme skeleton (a completer progressivement)

## Actions executees

1. src/hooks/use-gammes.ts :
   - useGammeModeles retourne number[] au lieu de GammeType[]
   - Import GammeType retire

2. src/pages/gammes/index.tsx :
   - Bouton "Nouvelle gamme" retire
   - Imports Plus, Button nettoyes

3. npx tsc --noEmit : OK
