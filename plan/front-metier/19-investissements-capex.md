# Étape 19 — Pilotage : Investissements (CapEx)

## Objectif

Suivi budgétaire des **investissements** par site (remplacement chaudière, réfection toiture…) :
montant demandé / prévu / dépense réelle, avec un statut libre.

## Contexte

Backend (`schema_complete.sql`) :

- `investissements` (site_id, created_by, `statut_capex_id` ref `statuts_capex`, `libelle`,
  `description`, `montant_demande`, `montant_prevu`, `depense_reelle` — tous `NUMERIC(12,2)`, ≥ 0,
  `date_demande`, deleted_at).
- `documents_investissements` (pièces jointes : devis, factures…).
- **Statut LIBRE** : aucune machine à états, aucun trigger de transition — l'utilisateur ajuste le
  statut (Demandé / Validé / Réalisé / Refusé…) sans contrainte. Scope site, soft-delete 90j.

## Fichier(s) impacté(s)

- `src/features/investissements/` (queries, mutations, schemas, components)
- `src/routes/_app/investissements.tsx` (remplacer le stub)

## Travail à réaliser

1. Liste (libellé, statut, montants, **écart prévu/réel**), recherche, règle des 4 états.
2. Création/édition : libellé, description, statut (dropdown `statuts_capex`), montants
   (`NUMERIC(12,2)` ≥ 0 — validation Zod : nombres positifs, 2 décimales), date de demande.
3. Onglet Documents (devis, factures) via le composant réutilisable de l'étape 13.
4. Rôles : gestion réservée **admin / manager** (dimension budgétaire) ; lecture selon RLS.

## Critère de validation

- Créer un investissement avec montants, changer librement son statut, voir l'écart prévu/réel.
- Un montant négatif est refusé (validation Zod + contrainte backend).
