# Étape 11 — Pilotage : Planning

## Objectif

Vue d'ensemble temporelle de la charge : grille **famille de gammes × semaine**, dérivée des OT.

## Contexte (cf. INDEX #5)

Pas de table « planning » : on **agrège les `ordres_travail`** par famille/gamme et par semaine ISO.
À confirmer : agrégation côté requête front, ou prévoir une vue backend si trop lourd.

## Fichier(s) impacté(s)

- `src/features/planning/` (queries d'agrégation, composant grille)
- `src/routes/_app/planning.tsx`

## Travail à réaliser

1. Charger les OT sur une fenêtre (~12 semaines, cf. INDEX #6 — une seule vue, pas trimestriel + focus).
2. Grille dense famille × semaine : cellule colorée selon statut/priorité, liseré si réglementaire,
   nombre d'OT si ≥ 2.
3. Interactions : clic cellule → 1 OT (détail) ou N OT (liste). Recherche par famille.
4. Tokens sémantiques pour les couleurs de statut (mapping documenté en étape « style »).

## Critère de validation

- La grille affiche les OT de la fenêtre, colorés par statut ; clic → détail ou liste.
- Performance correcte sur un parc réaliste (sinon basculer l'agrégation en vue backend).
