# Étape 4 — Référentiel : Sites

## Objectif

Premier vrai CRUD, **canonique** : lister / créer / modifier / supprimer (soft-delete) les sites.
Sert de modèle pour tous les CRUD suivants.

## Contexte

Création/suppression de site = **admin**. La création d'un site crée automatiquement sa régie
interne côté backend (trigger). 5 rôles : seul l'admin gère les sites.

## Fichier(s) impacté(s)

- `src/features/sites/` : `queries.ts`, `mutations.ts`, `schemas.ts`, `components/`
- `src/routes/_app/sites.tsx`
- `src/components/common/` : `DataTable` ou `CardGallery` (composant réutilisable à créer ici)

## Travail à réaliser

1. Liste des sites (`from('sites').select().is('deleted_at', null)`), **règle des 4 états**.
2. Création/édition via `Dialog` + TanStack Form + Zod (`schemas.ts`).
3. Suppression = soft-delete (`update deleted_at`), confirmation via Dialog.
4. Gérer l'erreur RLS `42501` (non-admin) → message clair, et masquer les actions si non-admin.
5. Extraire le **composant de liste réutilisable** (galerie de cartes ou DataTable) dans `common/`.

## Critère de validation

- Un admin crée/renomme/supprime un site ; un non-admin ne voit pas les actions d'écriture.
- Le composant de liste est réutilisable (utilisé dès l'étape 5).
