# BORG-2026-03-24-004 — Phase 11 Fonctions transversales

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Scan initial + Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC + EXECUTION (correction M1)

## Contexte

Audit Phase 11 : recherche globale Ctrl+K (UNION ALL 6 tables), export CSV (3 commandes), CommandPalette frontend, get_export_ot. 5 commandes Rust totales.

## Rapports des drones

### Scan initial
- UNION ALL 6 tables : colonnes verifiees ✓
- 4 export commands : queries correctes ✓
- CommandPalette : integration RootLayout ✓
- Declaration : 0 CRITIQUE, 0 HAUTE, 1 MOYENNE (print manquant)

### Six-de-Neuf (Contradicteur)
- Wildcard LIKE non echappe : % et _ dans query produisent resultats inattendus
- BOM UTF-8 : frontend gere correctement (faux positif)
- Event listener : singleton cleanup correct (faux positif)

## Verdict unifie

MOYENNES CORRIGEES : 1
- recherche_globale : caracteres LIKE speciaux (%, _, \) echappes avant format!()
- Clause ESCAPE '\\' ajoutee a chaque LIKE dans le UNION ALL

BASSES acceptees : 2
- CSV labels numeriques (acceptable)
- Print pages non implementees (scope reduit)

FAUX POSITIFS : 2
- BOM UTF-8 (frontend responsibility)
- Event listener leak (cleanup correct + singleton)

## Actions executees

1. src-tauri/src/commands/recherche.rs :
   - Echappement : query.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_")
   - Clause ESCAPE '\\' ajoutee aux 6 LIKE dans le UNION ALL

2. cargo check : OK
