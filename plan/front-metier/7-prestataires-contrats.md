# Étape 7 — Référentiel : Prestataires & contrats

## Objectif

Gérer les prestataires (externes + régie interne « Mon Entreprise ») et leurs contrats.

## Contexte

Backend : `prestataires` (`est_interne`, régie auto par site), `prestataires_sites` (liaison),
`contrats` (**scopés par site**, `type_contrat_id`, début/fin, `archived_at`), `contrats_gammes` (couverture).

## Fichier(s) impacté(s)

- `src/features/prestataires/` et `src/features/contrats/`
- `src/routes/_app/prestataires/`

## Travail à réaliser

1. Liste prestataires (cartes : coordonnées + badges contrats), recherche. Régie interne non supprimable.
2. Fiche prestataire : coordonnées + onglets (Contrats, Gammes, OT, Interventions, Documents).
3. Contrats : types (déterminé / indéterminé / tacite reconduction), **états dérivés** des dates
   (Signé → Actif → Terminé ; Préavis → Résilié), badges d'alerte d'échéance.
   - **V1 (cf. INDEX #6)** : avenants = simple historique (pas arbre parent-enfant) ; calcul de cycle/fenêtre
     de résiliation à confirmer (angle #4 réglementaire à croiser avec l'étape 9).
4. Couverture `contrats_gammes` (quelles gammes un contrat couvre).

## Critère de validation

- Créer un prestataire externe + un contrat déterminé ; l'état du contrat reflète les dates.
- La régie interne est présente et non supprimable.
