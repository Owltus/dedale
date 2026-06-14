# Étape 5 — Modèles de DI

## Objectif

Créer la feature `modeles-di` et l'écran `/bibliotheque/modeles-di` : CRUD des modèles de demandes d'intervention (libellé, description, constat pré-rempli, activation).

## Contexte

`modeles_di` : `libelle`, `description` (nullable), `constat_modele` (texte du constat pré-rempli), `est_actif`, `site_id` **NOT NULL**, `created_by` **NOT NULL**, `updated_at`. Point clé (A3) : **scope site uniquement** — pas de niveau entreprise pour cette table. L'écran exige donc un site actif (`NoSiteSelected`) et n'offre pas de choix « Entreprise/Site » : tout modèle est rattaché au site courant. `created_by` doit être renseigné à la création (id de l'utilisateur courant). Ces modèles sont déjà consommés en pré-remplissage côté demandes (`features/demandes/`).

C'est l'écran le plus simple (pas de récursivité, pas d'items, pas de JSON, pas de dualité de scope).

## Fichier(s) impacté(s)

- `src/features/modeles-di/queries.ts` (nouveau)
- `src/features/modeles-di/mutations.ts` (nouveau)
- `src/features/modeles-di/schemas.ts` (nouveau)
- `src/features/modeles-di/components/modele-di-form-dialog.tsx` (nouveau)
- `src/routes/_app/bibliotheque/modeles-di.tsx` (remplace le stub)

## Travail à réaliser

### 1. Queries (`queries.ts`)

`modelesDiQueries.list(siteId)` : `.eq('site_id', siteId)` (scope site strict), `.order('libelle')`, `.throwOnError()`. Pas de filtre entreprise (la table n'a pas de scope NULL).

### 2. Schemas (`schemas.ts`)

Zod : `libelle` (requis), `description` (nullable), `constat_modele` (requis), `est_actif` (boolean). `site_id` et `created_by` ne sont pas dans le formulaire : injectés en mutation.

### 3. Mutations (`mutations.ts`)

`useCreateModeleDi` (injecte `site_id = activeSiteId` et `created_by = user.id`), `useUpdateModeleDi`, `useDeleteModeleDi`. Récupérer l'utilisateur courant via le mécanisme existant (cf. `auth.tsx` / session Supabase). Invalidation `modelesDiQueries.all()`. Catch `42501`.

### 4. Formulaire (`modele-di-form-dialog.tsx`)

`FormDialog` + `TextField` (libellé) + `TextareaField` (description) + `TextareaField` (constat modèle, plus haut) + case `est_actif`.

### 5. Écran (`modeles-di.tsx`)

Remplace le stub : `<PageContainer>` + `<PageHeader action={Nouveau modèle} />`, `NoSiteSelected` si pas de site actif, `<QueryState>`, grille `cardGrid.default` (libellé, badge actif/inactif, extrait du constat). Carte → édition ; suppression → `ConfirmDialog`.

## Ordre d'exécution

1. `schemas.ts` → `queries.ts` → `mutations.ts`.
2. `modele-di-form-dialog.tsx`.
3. `modeles-di.tsx`.

## Critère de validation

- `npm run typecheck` + `npm run lint` passent.
- Sans site actif : l'écran affiche `NoSiteSelected`.
- Création d'un modèle (libellé + constat) ; il apparaît rattaché au site courant ; `created_by` renseigné sans erreur.
- Édition, activation/désactivation, suppression fonctionnelles.
- Le formulaire ne propose aucun choix « Entreprise/Site » (cohérent avec le scope site strict).
