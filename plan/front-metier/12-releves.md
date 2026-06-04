# Étape 12 — Pilotage : Relevés

## Objectif

Visualiser l'historique des **mesures** (énergie, température, pression…) saisies lors des OT, sous forme de courbes.

## Contexte (cf. INDEX #5)

Pas de table « relevés » : les mesures vivent dans `operations_execution` (opérations de type mesure).
On **agrège** par gamme/opération de mesure pour tracer des séries temporelles, avec traçabilité vers l'OT source.

## Fichier(s) impacté(s)

- `src/features/releves/` (queries d'agrégation, composant graphique)
- `src/routes/_app/releves/`
- dépendance : une lib de graphes (à choisir — ex. Recharts ; à valider)

## Travail à réaliser

1. Liste des gammes « mesurables » (avec opérations de type mesure) : nb mesures, dernier relevé.
2. Fiche : courbes par grandeur (unité), navigation temporelle (mois glissant / année), seuils horizontaux.
3. Clic sur un point → OT source.
4. **V1 (cf. INDEX #6)** : pas de détection auto de changement de compteur (saisie simple) ; à prévoir en V2.

## Critère de validation

- Les mesures d'une gamme s'affichent en courbe avec leur unité et leurs seuils.
- Cliquer un point ouvre l'OT correspondant.
