# Étape 3 — Modèles d'équipements

## Objectif

Créer la feature `modeles-equipements` et l'écran `/bibliotheque/modeles-equipements` : CRUD complet du catalogue de modèles d'équipements (nom, description, catégorie, `specifications` JSON, activation), réutilisant et étendant les requêtes déjà amorcées dans `features/equipements/`.

## Contexte

`modeles_equipements` existe et est déjà partiellement consommé : `features/equipements/queries.ts` expose `modelesEquipementsQueries.list(siteId)` et `features/equipements/mutations.ts` expose `useInstancierEquipement()` (RPC `instancier_equipement`, copie par valeur). Manquent : les mutations create/update/delete et le formulaire de gestion. La table porte `categorie_id` (→ étape 2), `specifications` (JSONB, défaut `{}`), `image_path`, `est_actif`, scope `site_id` (NULL = entreprise), soft-delete `deleted_at`.

Le JSON `specifications` est lu dans `equipements.tsx` (`readSpecifications`, `formatSpecValue`). Hypothèse retenue (A4) : clés libres → éditeur clé/valeur générique.

## Fichier(s) impacté(s)

- `src/features/modeles-equipements/queries.ts` (nouveau)
- `src/features/modeles-equipements/mutations.ts` (nouveau)
- `src/features/modeles-equipements/schemas.ts` (nouveau)
- `src/features/modeles-equipements/components/modele-equipement-form-dialog.tsx` (nouveau)
- `src/features/modeles-equipements/components/specifications-editor.tsx` (nouveau)
- `src/features/equipements/queries.ts` (modifié — ré-export pour ne pas casser `InstancierDialog`)
- `src/routes/_app/bibliotheque/modeles-equipements.tsx` (remplace le stub)

## Travail à réaliser

### 1. Queries (`queries.ts`)

Déplacer/recréer `modelesEquipementsQueries` ici (keys `all`/`list`, `.throwOnError()`, `.is('deleted_at', null)`, filtre scope entreprise/site, jointure `categories(nom)` pour l'affichage). Dans `features/equipements/queries.ts`, remplacer la définition par un **ré-export** depuis la nouvelle feature pour préserver l'import de `InstancierDialog` (A6).

### 2. Schemas (`schemas.ts`)

Zod : `nom` (requis), `description` (nullable), `categorie_id` (uuid nullable), `est_actif` (boolean), `specifications` (`z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))` ou structure validée), `site_id` (nullable). `ModeleEquipementFormValues` + `initialValues`.

### 3. Mutations (`mutations.ts`)

`useCreateModeleEquipement`, `useUpdateModeleEquipement`, `useDeleteModeleEquipement` (soft-delete). Invalidation `modelesEquipementsQueries.all()`. Catch `42501`.

### 4. Éditeur de specifications (`specifications-editor.tsx`)

Composant contrôlé : liste de lignes `{ clé, valeur }` avec ajout/suppression, rendu à partir d'un objet et émettant l'objet reconstruit. Validation : clés non vides, pas de doublon. Pas de textarea JSON brut.

### 5. Formulaire (`modele-equipement-form-dialog.tsx`)

`FormDialog` + `TextField` (nom), `TextareaField` (description), `SelectField` (catégorie — alimenté par `categoriesQueries`, scope `equipement`/`mixte`), `SelectField` (portée entreprise/site), case `est_actif`, et `<SpecificationsEditor>`. Validation `safeParse` + `fieldErrors`.

### 6. Écran (`modeles-equipements.tsx`)

Remplace le stub : `<PageContainer>` + `<PageHeader action={Nouveau modèle} />`, `NoSiteSelected` si pas de site, `<QueryState>`, grille `cardGrid.compact` de cartes (nom, catégorie, badge actif/inactif, badge entreprise/site, nombre de specs). Carte → édition. Bouton supprimer → `ConfirmDialog`.

## Ordre d'exécution

1. `schemas.ts` → `queries.ts` (+ ré-export dans equipements) → `mutations.ts`.
2. `specifications-editor.tsx` → `modele-equipement-form-dialog.tsx`.
3. `modeles-equipements.tsx`.

## Critère de validation

- `npm run typecheck` + `npm run lint` passent ; `InstancierDialog` (dans `/equipements`) fonctionne toujours (ré-export intact).
- Création d'un modèle avec catégorie + 2 specifications ; édition ; soft-delete.
- Le select de catégorie ne propose que les scopes `equipement`/`mixte`.
- L'éditeur de specifications ajoute/supprime des lignes et persiste l'objet correctement.
- Badges actif/inactif et entreprise/site corrects.
