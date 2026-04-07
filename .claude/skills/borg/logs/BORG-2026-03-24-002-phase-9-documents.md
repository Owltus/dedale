# BORG-2026-03-24-002 — Phase 9 Documents

> Projet : GMAO Desktop — Tauri v2 + React 19 + TypeScript 6 + SQLite
> Drones deployes : Scan initial + Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC + EXECUTION (corrections H1 + H2)

## Contexte

Audit Phase 9 : documents (SHA-256 + stockage fichier), 6 tables de liaison, 6 triggers orphelins. 17 commandes Rust, 510 LOC.

## Rapports des drones

### Scan initial
- 7/7 colonnes documents : MATCH ✓
- 17/17 commandes : correct ✓
- 6/6 triggers orphelins : valides ✓
- Declaration : 0 CRITIQUE, 0 HAUTE — CLEAN total

### Six-de-Neuf (Contradicteur) — FAILLES TROUVEES
Le Contradicteur invalide le verdict CLEAN :
- HAUTE : upload_document ecrit fichier AVANT INSERT DB → hash duplique = fichier orphelin
- HAUTE : 3 link_document_* (OT, contrat, DI) sans protection d'etat (cloture/archive/resolue)
- MOYENNE : delete_document DB supprime avant fichier → orphelin disque si fs echoue
- BASSE : readonly prop non utilise, type string loose, path traversal theorique

## Verdict unifie

HAUTES CORRIGEES : 2
1. upload_document : ajout verification hash en DB AVANT ecriture fichier
   → Si hash existe, erreur propre "Ce fichier existe deja" sans ecrire sur disque
2. link_document_ordre_travail : check id_statut_ot NOT IN (3,4) avant INSERT
   link_document_contrat : check est_archive != 1 avant INSERT
   link_document_di : check id_statut_di != 2 avant INSERT

MOYENNES acceptees : 1
- delete_document : ordre DB→fichier inverse idéal mais message explicite

BASSES acceptees : 3
- readonly prop, type loose, path traversal

## Actions executees

1. src-tauri/src/commands/documents.rs :
   - upload_document : verification hash duplique AVANT ecriture fichier (SELECT COUNT + early return)
   - link_document_ordre_travail : check statut OT (3/4 bloque)
   - link_document_contrat : check est_archive (1 bloque)
   - link_document_di : check statut DI (2 bloque)

2. cargo check : OK
