# Étape 2 — Domaines & familles (catégories)

## Objectif

Créer la feature `categories` et l'écran `/bibliotheque/categories` permettant de visualiser la hiérarchie des catégories (domaines → familles, récursive) et d'en faire le CRUD. C'est la brique de base : les modèles d'équipements s'y rattachent via `categorie_id`.

## Contexte

La table `categories` est récursive (`parent_id → categories.id`), unifie les anciens domaines + familles, et porte un scope 2 niveaux : `site_id NULL` = catégorie entreprise (globale), renseigné = catégorie de site. Elle a aussi un `scope` (enum `categorie_scope` : `equipement` / `gamme` / `mixte`), `est_actif`, `deleted_at` (soft-delete), `image_path`, `miniature_id`. Le scope `equipement`/`mixte` est ce qui qualifie un équipement ; `gamme`/`mixte` ce qui qualifie une gamme.

Aucun TreeView n'existe dans le projet : on construit un composant récursif maison. Le scope entreprise/site se gère comme dans `features/equipements/queries.ts` (filtrer `c.site_id === null || c.site_id === activeSiteId`).

## Fichier(s) impacté(s)

- `src/features/categories/queries.ts` (nouveau)
- `src/features/categories/mutations.ts` (nouveau)
- `src/features/categories/schemas.ts` (nouveau)
- `src/features/categories/components/category-tree.tsx` (nouveau)
- `src/features/categories/components/category-form-dialog.tsx` (nouveau)
- `src/routes/_app/bibliotheque/categories.tsx` (remplace le stub)

## Travail à réaliser

### 1. Queries (`queries.ts`)

Sur le modèle de `prestatairesQueries` : query keys (`all` / `list`), `queryOptions` avec `.throwOnError()`, filtre `.is('deleted_at', null)`, puis filtrage applicatif du scope entreprise/site. Renvoyer la liste plate (l'arbre est reconstruit côté composant à partir de `parent_id`).

```ts
export const categoriesQueries = {
  all: () => ['categories'] as const,
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...categoriesQueries.all(), 'list', siteId] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('categories')
          .select('*')
          .is('deleted_at', null)
          .order('nom')
          .throwOnError()
        return (data ?? []).filter(
          (c) => c.site_id === null || c.site_id === siteId,
        )
      },
    }),
}
```

### 2. Schemas (`schemas.ts`)

Zod : `nom` (trim, min 1, max), `scope` (`z.enum(['equipement','gamme','mixte'])`), `parent_id` (uuid nullable), `est_actif` (boolean), `site_id` (uuid nullable — NULL = entreprise). Exporter `CategorieFormValues` + `initialValues(categorie?)`.

### 3. Mutations (`mutations.ts`)

`useCreateCategorie`, `useUpdateCategorie`, `useDeleteCategorie` (soft-delete : `update({ deleted_at: now })`). `onSuccess` → `invalidateQueries({ queryKey: categoriesQueries.all() })`. Catch des erreurs RLS (`42501`) → `toast.error` lisible (« action non autorisée sur ce périmètre »).

### 4. Composant arbre (`category-tree.tsx`)

Reconstruire l'arbre depuis la liste plate (`parent_id`). Composant `CategoryNode` récursif : indentation par profondeur, `ChevronRight`/`ChevronDown` (lucide) pour expand/collapse via `useState`, badge du `scope`, badge « Entreprise » si `site_id === null`. Actions par nœud (éditer, ajouter un enfant, supprimer) réservées admin/manager.

### 5. Formulaire (`category-form-dialog.tsx`)

`FormDialog` + `TextField` (nom), `SelectField` (scope : Équipement / Gamme / Mixte), `SelectField` (parent : « — Aucun (racine) — » + catégories existantes), `SelectField` (portée : Entreprise / Site actif). Validation `safeParse` + `fieldErrors`. Le parent par défaut = celui sur lequel on a cliqué « ajouter un enfant ».

### 6. Écran (`categories.tsx`)

Remplacer le stub : `requireNav` conservé, `<PageContainer>` + `<PageHeader title="Domaines & familles" action={<bouton Nouvelle catégorie>} />`, garde `NoSiteSelected` si pas de site actif, `<QueryState>` (pending/error/empty), puis `<CategoryTree>`. Bouton « Nouvelle catégorie » ouvre le form-dialog en mode création racine.

## Ordre d'exécution

1. `schemas.ts` → `queries.ts` → `mutations.ts`.
2. `category-tree.tsx` → `category-form-dialog.tsx`.
3. `categories.tsx` (assemblage).

## Critère de validation

- `npm run typecheck` + `npm run lint` passent.
- L'arbre affiche la hiérarchie ; expand/collapse fonctionne.
- Création d'un domaine (racine, scope mixte, portée entreprise) puis d'une famille enfant : les deux apparaissent correctement imbriquées.
- Édition et suppression (soft-delete) reflétées après invalidation du cache.
- Un badge distingue les catégories « Entreprise » des catégories de site.
- Une tentative d'écriture hors périmètre (si reproductible) affiche un toast d'erreur propre, pas un crash.
