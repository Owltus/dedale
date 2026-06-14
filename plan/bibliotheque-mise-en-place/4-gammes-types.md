# Étape 4 — Gammes-types (modèles d'opérations)

## Objectif

Créer la feature `modeles-operations` et l'écran `/bibliotheque/gammes-types` : CRUD d'un modèle d'opérations (le « patron » de gamme) et de ses items d'opérations (maître/détail).

## Contexte

Deux tables : `modeles_operations` (nom, description, image_path, scope `site_id` NULL = entreprise) et `modeles_operations_items` (relation 1:N : nom, ordre, `modele_operation_id`, `type_operation_id`, `unite_id`, `seuil_minimum`, `seuil_maximum`). Ces modèles alimentent les gammes via `gamme_modeles` / `copier_gamme` côté backend — la v1 ne fait que **gérer le catalogue**, pas l'instanciation (déjà couverte ailleurs). Aucune feature front n'existe aujourd'hui.

`modeles_operations` ne porte pas de `deleted_at` (pas de soft-delete sur cette table — vérifier dans `database.types.ts` au moment de coder ; ne pas filtrer `deleted_at` si la colonne est absente). Les `type_operation_id` et `unite_id` viennent de tables de référence (`types_operations`, `unites`) à charger pour les selects.

## Fichier(s) impacté(s)

- `src/features/modeles-operations/queries.ts` (nouveau)
- `src/features/modeles-operations/mutations.ts` (nouveau)
- `src/features/modeles-operations/schemas.ts` (nouveau)
- `src/features/modeles-operations/components/gamme-type-form-dialog.tsx` (nouveau)
- `src/features/modeles-operations/components/operation-items-editor.tsx` (nouveau)
- `src/routes/_app/bibliotheque/gammes-types.tsx` (remplace le stub)

## Travail à réaliser

### 1. Queries (`queries.ts`)

- `modelesOperationsQueries.list(siteId)` : modèles, filtre scope entreprise/site, `.throwOnError()`.
- `modelesOperationsQueries.items(modeleId)` : items d'un modèle, triés par `ordre`.
- Charger les références `types_operations` et `unites` (pour les selects de l'éditeur d'items) — réutiliser un éventuel query existant si présent dans `features/gammes` ou `releves`.

### 2. Schemas (`schemas.ts`)

- `ModeleOperationFormValues` : `nom` (requis), `description` (nullable), `site_id` (nullable).
- `OperationItemFormValues` : `nom`, `type_operation_id`, `unite_id` (nullable), `seuil_minimum`/`seuil_maximum` (nullable, selon type mesure), `ordre`.

### 3. Mutations (`mutations.ts`)

- Modèle : create/update/delete. (Si pas de `deleted_at` → suppression réelle `.delete()` ; vérifier le comportement RLS et les dépendances `gamme_modeles` qui peuvent renvoyer une erreur de contrainte → catcher et message clair.)
- Items : create/update/delete d'un item, invalidation de `items(modeleId)`.

### 4. Éditeur d'items (`operation-items-editor.tsx`)

Liste maître/détail des items du modèle sélectionné : ajout/édition/suppression, réordonnancement par `ordre`, selects `type_operation_id` et `unite_id`, champs seuils conditionnés au type (mesure vs contrôle). Inspiration : `features/gammes/components/operation-form-dialog.tsx`.

### 5. Formulaire modèle (`gamme-type-form-dialog.tsx`)

`FormDialog` + `TextField` (nom) + `TextareaField` (description) + `SelectField` (portée entreprise/site).

### 6. Écran (`gammes-types.tsx`)

Remplace le stub. Pattern liste + détail : grille de cartes de modèles à gauche/haut ; sélection d'un modèle ouvre la gestion de ses items (drill-down `useState`, pas de side-panel sur mobile). `NoSiteSelected`, `<QueryState>`, badges entreprise/site.

## Ordre d'exécution

1. `schemas.ts` → `queries.ts` → `mutations.ts`.
2. `operation-items-editor.tsx` → `gamme-type-form-dialog.tsx`.
3. `gammes-types.tsx`.

## Critère de validation

- `npm run typecheck` + `npm run lint` passent.
- Création d'un modèle d'opérations puis ajout de 2 items (un contrôle, une mesure avec seuils) ; réordonnancement visible.
- Édition et suppression d'un item ; suppression d'un modèle (ou message d'erreur propre si référencé par `gamme_modeles`).
- Selects `type_operation_id` / `unite_id` alimentés depuis les tables de référence.
- Badges entreprise/site corrects.
