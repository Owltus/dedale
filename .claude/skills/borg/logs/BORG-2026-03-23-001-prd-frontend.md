# BORG-2026-03-23-001 — PRD-FRONTEND.md

> Projet : GMAO desktop (Tauri v2 + React + SQLite)
> Drones deployes : 5/5 (Trois-de-Cinq, Sept-de-Neuf, Deux-de-Cinq, Quatre-de-Cinq, Six-de-Neuf)
> Mode : DIAGNOSTIC

## Verdict unifie

### Statistiques
- Failles brutes : 21 → Faux positifs elimines : 2 → CONFIRMEES : 19
- CRITIQUES : 8 | HAUTES : 5 | MOYENNES : 5 | BASSES : 1
- Angles morts Contradicteur : 5

### CRITIQUES (8)
1. Aucun feedback sur auto-cloture OT — l'utilisateur ne voit pas que son OT est cloture automatiquement
2. Aucun feedback sur reprogrammation automatique — le nouvel OT cree par le systeme est invisible
3. Bascule prestataire silencieuse — gamme non-reglementaire sans contrat → bascule sur interne sans notification
4. Cascade annulation silencieuse — ops En attente/En cours auto-annulees sans feedback
5. Reprogrammation apres annulation avec ops NA non visible
6. Propagation modifications gamme/gamme type vers OT actifs sans feedback
7. Reouverture OT cree chaine disjointe — l'OT suivant (reprogramme) existe deja, doublons silencieux
8. Transitions depuis statut Reouvert (5) non documentees dans les boutons UI

### HAUTES (5)
1. Snapshots immuables (nom_gamme, nom_prestataire, etc.) non signales visuellement
2. Resurrection OT : reset des operations non mentionne dans le PRD
3. Contrats avenants : heritage des gammes liees (contrats_gammes) non documente
4. Reprogrammation peut changer le prestataire silencieusement si la gamme a ete modifiee entre-temps
5. Types DI sans protection suppression en base (RESTRICT manquant)

### MOYENNES (5)
1. Types DI et Postes sans CRUD visible dans les parametres
2. Gamme reglementaire sans contrat : erreur backend uniquement, pas de validation frontend proactive
3. Guard UI avant cloture manuelle absent
4. Navigation asymetrique : contrat → gammes visible, gamme → contrats invisible
5. Pas de bouton "Cloturer" visible — ambiguite auto vs manuel

### BASSES (1)
1. Transitions statut 5 (Reouvert) vers Planifie et Cloture non exposees dans l'ActionBar

### Angles morts Six-de-Neuf (5)
1. Reprogrammation change prestataire si gamme modifiee entre OT (chaine incoherente)
2. Statut "Non applicable" (5) ambigue vs "Annulee" (4) — difference non expliquee pour l'utilisateur
3. Reouverture + reprogrammation = 2 OT actifs pour meme gamme (dualite chaine)
4. Contrats archives → contrats_gammes toujours lies a l'ancien contrat → validation echoue silencieusement
5. types_di sans trigger de protection suppression (FK RESTRICT existe mais message cryptique)

### Faux positifs elimines (2)
1. CHECK DB prestataire interne sur contrats → discipline de donnees suffisante
2. Conformite ops qualitatives → ambiguite metier legitime, pas une faille

## Actions executees
Diagnostic uniquement — corrections appliquees dans PRD-FRONTEND.md v2 par le Collectif suite a ce rapport.
