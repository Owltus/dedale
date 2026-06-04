# Étape 10 — Maintenance : Demandes d'intervention (DI)

## Objectif

Signalements curatifs : créer, suivre et résoudre des demandes, avec leurs modèles.

## Contexte

Backend : `demandes_intervention` (statut ref `statuts_di` : ouverte/resolue/reouvert, titre,
description, date_resolution), `di_localisations` / `di_equipements` (liaisons optionnelles),
`modeles_di` (scope SITE). **DI et OT sont découplés** (pas de conversion DI → OT). Le rôle
**demandeur** crée des DI ; la résolution est ouverte aux rôles ayant accès au site.

## Fichier(s) impacté(s)

- `src/features/demandes/` et `src/features/modeles-di/`
- `src/routes/_app/demandes/`

## Travail à réaliser

1. Liste des DI (badge statut), recherche, 4 états. Le **demandeur** ne voit que ses propres DI.
2. Création guidée : constat (obligatoire), lieu ↔ équipement couplés (optionnels), prestataire (optionnel,
   hors régie), date de constat. **Suggestions rapides** depuis `modeles_di`.
3. Fiche DI : onglets Détail (Constat + Résolution) et Documents.
4. **Cycle** Ouverte → Résolue ↔ Réouverte (résolution = date + description obligatoires). Catcher transitions.

## Critère de validation

- Un demandeur crée une DI ; un autre rôle la résout (date + description) ; réouverture possible.
- Le demandeur ne voit pas les DI des autres.
