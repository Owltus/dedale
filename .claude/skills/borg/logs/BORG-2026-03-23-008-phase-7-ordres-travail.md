# BORG-2026-03-23-008 — Phase 7 Ordres de travail

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Scan initial + Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC + EXECUTION (corrections H1, H2, M1)

## Contexte

Audit Phase 7 : ordres_travail (28 colonnes, 16 triggers), operations_execution (16 colonnes). 7 commandes Rust, 405 LOC. La piece maitresse du workflow GMAO.

## Rapports des drones

### Scan initial
- 28/28 colonnes OT : MATCH ✓
- 16/16 colonnes OpExec : MATCH ✓
- 7/7 commandes : syntaxe correcte ✓
- Declaration : 0 CRITIQUE, 0 HAUTE

### Six-de-Neuf (Contradicteur) — FAILLES TROUVEES
Le Contradicteur a identifie 7 failles + 3 angles morts.
Apres analyse du Collectif, 3 faux positifs elimines :
- #2 param reuse ?1 (valide en rusqlite)
- #6 format!() constante (safe, anti-pattern stylistique)
- #7 FK operations→gamme (la chaine op_exec→OT→gamme est integre via CASCADE+RESTRICT)

4 failles confirmees :
- H1 : Zod manque .refine() cross-field date_execution ↔ statut
- H2 : Zod accepte statut 4 (Annulee = systeme seulement)
- M1 : bulk_terminer sans transaction
- M2 : Frontend TRANSITIONS ne desactive pas "Cloturer" si ops en attente (accepte)

## Verdict unifie

HAUTES CORRIGEES : 2
1. opExecUpdateSchema : ajout .refine(v => v !== 4) pour exclure statut Annulee
2. opExecUpdateSchema : ajout .refine() cross-field (statut 2/3 exige date_execution)

MOYENNES CORRIGEES : 1
3. bulk_terminer_operations : wrappee dans BEGIN IMMEDIATE / COMMIT / ROLLBACK

MOYENNES ACCEPTEES : 1
4. Frontend TRANSITIONS ne pre-valide pas la cloture (trigger protege, message clair)

## Actions executees

1. src/lib/schemas/ordres-travail.ts :
   - opExecUpdateSchema : .refine(v => v !== 4, "Statut Annulee reserve au systeme")
   - opExecUpdateSchema : .refine(cross-field date_execution requis pour statut 2/3)

2. src-tauri/src/commands/ordres_travail.rs :
   - bulk_terminer_operations : BEGIN IMMEDIATE + COMMIT/ROLLBACK autour de la boucle

3. Verification : cargo check OK, npx tsc --noEmit OK
