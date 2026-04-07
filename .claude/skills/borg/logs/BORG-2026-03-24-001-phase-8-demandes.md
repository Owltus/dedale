# BORG-2026-03-24-001 — Phase 8 Demandes d'intervention

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Scan initial + Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC + EXECUTION (corrections H1 + M1)

## Contexte

Audit Phase 8 : demandes_intervention (11 colonnes, 4 triggers, machine a etats 3 statuts), di_gammes, di_localisations. 13 commandes Rust.

## Rapports des drones

### Scan initial
- 11/11 colonnes DI : MATCH ✓
- 13/13 commandes : syntaxe correcte ✓
- 4/4 triggers : valides ✓
- Declaration : 0 CRITIQUE, 0 HAUTE, 0 MOYENNE — CLEAN total

### Six-de-Neuf (Contradicteur) — FAILLES TROUVEES
Le Contradicteur a invalide le verdict CLEAN :
- CRITIQUE : link/unlink gammes+localisations permettent modification sur DI resolue (statut 2)
  Le trigger protection_di_resolue ne protege QUE la table demandes_intervention
  Les tables di_gammes et di_localisations n'ont PAS de trigger BEFORE INSERT/DELETE
- MOYENNE : pas de commandes GET pour lire les gammes/localisations liees a une DI
- BASSE : format!() dynamique dans update_demande (sur mais anti-pattern)

## Verdict unifie

HAUTES CORRIGEES : 1
- check_di_not_resolue() helper ajoute : verifie statut != 2 avant toute modification de liaison
- Applique a link_di_gamme, unlink_di_gamme, link_di_localisation, unlink_di_localisation

MOYENNES CORRIGEES : 1
- get_di_gammes et get_di_localisations ajoutees (2 nouvelles commandes)
- Enregistrees dans lib.rs

BASSES acceptees : 1
- format!() dynamique dans update_demande (noms hardcodes, safe en pratique)

## Actions executees

1. src-tauri/src/commands/demandes.rs :
   - Helper check_di_not_resolue() : query statut, return Err si == 2
   - link_di_gamme, unlink_di_gamme : appel check_di_not_resolue avant INSERT/DELETE
   - link_di_localisation, unlink_di_localisation : idem
   - get_di_gammes : SELECT id_gamme FROM di_gammes WHERE id_di = ?1
   - get_di_localisations : SELECT id_localisation FROM di_localisations WHERE id_di = ?1

2. src-tauri/src/lib.rs :
   - get_di_gammes et get_di_localisations enregistrees (total 123 commandes)

3. Verification : cargo check OK, npx tsc --noEmit OK
