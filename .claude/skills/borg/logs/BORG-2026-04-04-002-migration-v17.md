# BORG-2026-04-04-002 — Migration v17 champs dynamiques

> Projet : Mantis — Tauri v2 + Rust + SQLite
> Drones deployes : 4 (Cartographe, Conformite, Failles backend, Failles frontend)
> Mode : EXECUTION

## Zone assimilee
Migration v17 complete : retrait colonnes fixes equipements (nom, marque, modele, numero_serie), ajout nom_affichage cache, id_champ_affichage, est_archive, triggers protection/cache, reecriture triggers OT, suppression numero_serie_equipement d'ordres_travail. 11 fichiers backend + 10 fichiers frontend.

## Verdict unifie

FAILLES CONFIRMEES : 3
- CRITIQUES : 1 (formulaire creation famille sans selecteur modele)
- BASSES : 2 (commentaire 28→27 colonnes, documentation ordre operations)

## Actions executees

### Fix F1 — CRITIQUE : selecteur modele dans creation famille (domaines/[idDomaine].tsx)
- Ajout import Select + useModelesEquipements
- Ajout id_modele_equipement aux defaultValues du formulaire
- Ajout Select avec liste des modeles dans le dialog de creation
- Ajout affichage erreur Zod si modele non selectionne

### Fix F2 — BASSE : commentaire colonnes ordres_travail.rs
- Remplacement "28 colonnes" par "27 colonnes" (2 occurrences)

### Verification
- `cargo build` : 0 erreur
- `npx tsc --noEmit` : 0 erreur
- `python seed.py` : 12 modeles, 60 champs, 90 valeurs, toutes familles ont un modele
