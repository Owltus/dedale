# Étape 15 — Pilotage : Tableau de bord

## Objectif

Page d'accueil synthétique : alertes et indicateurs clés, **version sobre** (cf. INDEX #6).

## Contexte

Remplace l'accueil minimal actuel. L'ancien proposait sunburst animé + frise contrats : on les
remplace par des cartes/listes sobres en V1 (les visualisations riches → V2 si besoin avéré).

## Fichier(s) impacté(s)

- `src/features/dashboard/`
- `src/routes/_app/index.tsx` (remplacer l'accueil actuel)

## Travail à réaliser

1. Cartes KPI : OT en retard / cette semaine / en cours ; gammes à jour (%); contrats proches échéance.
2. Listes compactes : dernières DI, derniers documents. Alerte « OT réglementaires sans document ».
3. **Bloc « Premiers pas »** si base vierge (checklist : sites, localisations, équipements, prestataires, gammes, 1er OT).
4. Éléments cliquables → vers les écrans filtrés correspondants.

## Critère de validation

- Le tableau de bord affiche des indicateurs réels et des alertes ; base vierge → checklist d'amorçage.
