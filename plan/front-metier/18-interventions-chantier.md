# Étape 18 — Maintenance : Interventions de chantier

## Objectif

Gérer les **travaux de chantier ponctuels** (souvent confiés à un prestataire) — distincts des
demandes d'intervention (curatif léger) et des ordres de travail (préventif/réglementaire).

## Contexte

Backend (`schema_complete.sql`) :

- `interventions_chantier` (site_id, created_by, prestataire_id, `statut_chantier_id` ref
  `statuts_chantier`, titre, description, `date_demande`, `date_prevue`, `date_fin`,
  `compte_rendu`, `cloture_by`, deleted_at).
- Liaisons N-N : `chantier_localisations` (locaux), `chantier_equipements` (équipements).
- `documents_interventions_chantier` (pièces jointes).
- **Machine à états** via `statuts_chantier` (1 → 2/3 → 4) ; **compte-rendu obligatoire** au passage
  « Terminé » (contrôlé par trigger ; `cloture_by` forcé serveur). Soft-delete 90j.

## Fichier(s) impacté(s)

- `src/features/chantiers/` (queries, mutations, schemas, components)
- `src/routes/_app/chantiers.tsx` (remplacer le stub)

## Travail à réaliser

1. Liste des chantiers (titre, statut coloré, prestataire, dates), recherche, **règle des 4 états**.
2. Création/édition : titre, description, prestataire (optionnel), dates (demande/prévue/fin),
   locaux et équipements concernés (multi-sélection, même site).
3. **Machine à états** (Demandé → Prévu/En cours → Terminé) : transitions via UPDATE, **compte-rendu
   obligatoire** pour clôturer ; catcher les transitions interdites ; clôturé = lecture seule.
4. Onglet Documents (composant réutilisable de l'étape 13).

## Critère de validation

- Créer un chantier, lui associer un local et un équipement, le clôturer avec compte-rendu.
- Clôturer sans compte-rendu est refusé proprement (erreur backend affichée).
