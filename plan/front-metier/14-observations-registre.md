# Étape 14 — Conformité : Observations & registre de sécurité

## Objectif

Suivre les observations/réserves de conformité (rattachées aux OT) et présenter le registre de sécurité.

## Contexte

Backend : `observations` (ot_id, source_type signalement/contrôle/levée, statut, levée tracée +
document d'appui). Vues `v_registre_securite` et `v_observations_dashboard` (filtrées par rôle/site,
NF EN 13306). Pas de machine à états imposée (statut libre).

## Fichier(s) impacté(s)

- `src/features/observations/`
- `src/routes/_app/registre.tsx`

## Travail à réaliser

1. Liste des observations via `v_observations_dashboard` (4 états, filtres par statut/source).
2. Création d'une observation depuis un OT ; **levée** d'une observation (qui + quand + document d'appui).
3. Registre de sécurité via `v_registre_securite` (jointure observations + OT + équipement), exportable plus tard.

## Critère de validation

- Créer une observation sur un OT, la lever avec un document ; elle apparaît dans le registre.
