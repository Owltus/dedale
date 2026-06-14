# Étape 1 — Fondations navigation & routing

## Objectif

Mettre en place la coquille de la section « Bibliothèque » : un 3e groupe dans la sidebar (visible admin/manager), un layout de route parent `/bibliotheque` avec garde de rôle, une page d'accueil présentant 4 cartes de navigation, et 4 routes enfants en placeholder pour que la navigation soit fonctionnelle et que le projet type-check de bout en bout.

## Contexte

La navigation est pilotée par une source unique `src/lib/nav.ts` (type `NavKey` + table `NAV_ROLES` + `canSeeNav`), consommée à la fois par la sidebar (`app-sidebar.tsx`) et par les gardes de route (`nav-guard.ts` → `requireNav`). Toute nouvelle entrée doit être déclarée aux deux endroits. `routeTree.gen.ts` est généré automatiquement par le plugin Vite TanStack Router : ne jamais l'éditer à la main.

Cette étape touche les fichiers de navigation partagés (source de vérité de toute l'app) et crée plus de 5 fichiers : elle est marquée critique et fera l'objet d'un contrôle après exécution.

## Fichier(s) impacté(s)

- `src/lib/nav.ts` (modifié)
- `src/components/common/app-sidebar.tsx` (modifié)
- `src/routes/_app/bibliotheque.tsx` (nouveau — layout parent)
- `src/routes/_app/bibliotheque/index.tsx` (nouveau — accueil)
- `src/routes/_app/bibliotheque/categories.tsx` (nouveau — stub)
- `src/routes/_app/bibliotheque/modeles-equipements.tsx` (nouveau — stub)
- `src/routes/_app/bibliotheque/gammes-types.tsx` (nouveau — stub)
- `src/routes/_app/bibliotheque/modeles-di.tsx` (nouveau — stub)

## Travail à réaliser

### 1. Déclarer les NavKey et leurs rôles (`src/lib/nav.ts`)

Ajouter au type `NavKey` les 5 clés de la section, et les mapper dans `NAV_ROLES` vers `ROLES_ADMINISTRATIF` :

```ts
export type NavKey =
  | '/'
  // … clés existantes …
  | '/bibliotheque'
  | '/bibliotheque/categories'
  | '/bibliotheque/modeles-equipements'
  | '/bibliotheque/gammes-types'
  | '/bibliotheque/modeles-di'

const NAV_ROLES: Record<NavKey, readonly string[] | 'tous'> = {
  // … entrées existantes …
  '/bibliotheque': ROLES_ADMINISTRATIF,
  '/bibliotheque/categories': ROLES_ADMINISTRATIF,
  '/bibliotheque/modeles-equipements': ROLES_ADMINISTRATIF,
  '/bibliotheque/gammes-types': ROLES_ADMINISTRATIF,
  '/bibliotheque/modeles-di': ROLES_ADMINISTRATIF,
}
```

### 2. Ajouter le groupe sidebar (`src/components/common/app-sidebar.tsx`)

Importer les icônes lucide nécessaires (`BookOpen`, `Layers`, `Package`, `ListChecks`, `FileText`), déclarer le tableau `BIBLIOTHEQUE` et rendre un 3e `NavGroup`. Les enfants pointent vers les routes ; l'accueil `/bibliotheque` n'a pas besoin d'item dédié (on y accède par le titre de groupe ou une carte — au choix, retenir : pas d'item « accueil » dans la sidebar, les 4 sous-écrans suffisent).

```tsx
const BIBLIOTHEQUE: NavItem[] = [
  {
    to: '/bibliotheque/categories',
    label: 'Domaines & familles',
    icon: Layers,
  },
  {
    to: '/bibliotheque/modeles-equipements',
    label: "Modèles d'équipements",
    icon: Package,
  },
  { to: '/bibliotheque/gammes-types', label: 'Gammes-types', icon: ListChecks },
  { to: '/bibliotheque/modeles-di', label: 'Modèles de DI', icon: FileText },
]
```

Dans `SidebarContent`, ajouter après le groupe « Référentiels » (ou avant, selon priorité produit) :

```tsx
<NavGroup
  title="Bibliothèque"
  items={BIBLIOTHEQUE}
  role={role}
  iconOnly={iconOnly}
  touch={touch}
  onNavigate={onNavigate}
/>
```

Note : `NavItem.to` est typé `NavKey` — les nouvelles clés de l'étape 1.1 doivent donc être ajoutées avant pour que ça type-check.

### 3. Layout parent (`src/routes/_app/bibliotheque.tsx`)

```tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'

export const Route = createFileRoute('/_app/bibliotheque')({
  beforeLoad: ({ context }) => requireNav('/bibliotheque', context.queryClient),
  component: () => <Outlet />,
})
```

### 4. Accueil de section (`src/routes/_app/bibliotheque/index.tsx`)

Page sous `<PageContainer>` + `<PageHeader>` présentant 4 cartes cliquables (pattern inspiré de `features/dashboard/components/premiers-pas.tsx`), chacune un `<Link>` TanStack vers un sous-écran (titre + courte description + icône). Grille via `cardGrid.default`.

```tsx
export const Route = createFileRoute('/_app/bibliotheque/')({
  component: BibliothequeAccueil,
})
```

### 5. Quatre routes stub

Pour chaque sous-écran, créer une route minimale qui type-check et affiche un placeholder « En construction » (sera remplacé aux étapes 2 à 5). Chaque stub porte sa propre garde :

```tsx
export const Route = createFileRoute('/_app/bibliotheque/categories')({
  beforeLoad: ({ context }) =>
    requireNav('/bibliotheque/categories', context.queryClient),
  component: () => (
    <PageContainer>
      <PageHeader title="Domaines & familles" />
    </PageContainer>
  ),
})
```

Idem pour `modeles-equipements`, `gammes-types`, `modeles-di` avec leur NavKey respective.

## Ordre d'exécution

1. `nav.ts` : NavKey + NAV_ROLES (sinon les items sidebar et gardes ne type-checkent pas).
2. Routes : layout parent, puis `index.tsx`, puis les 4 stubs.
3. `app-sidebar.tsx` : icônes + tableau `BIBLIOTHEQUE` + `NavGroup`.
4. Lancer `npm run dev` pour déclencher la régénération de `routeTree.gen.ts`.

## Critère de validation

- `npm run typecheck` passe (arbre de routes régénéré, NavKey cohérentes).
- `npm run lint` passe.
- En `admin`/`manager` : le groupe « Bibliothèque » apparaît dans la sidebar avec ses 4 entrées ; `/bibliotheque` affiche l'accueil à cartes ; chaque carte/lien navigue vers le bon stub.
- En `technicien`/`lecteur`/`demandeur` : le groupe « Bibliothèque » n'apparaît pas ; un accès direct à `/bibliotheque/categories` redirige via `landingFor(role)`.

## Contrôle (audit manuel — étape critique)

- `nav.ts` : les 5 NavKey sont présentes dans le type **et** dans `NAV_ROLES` (pas d'oubli → sinon erreur de type sur `Record<NavKey, …>`).
- Aucune édition manuelle de `routeTree.gen.ts`.
- Gardes : layout parent **et** chaque enfant appellent `requireNav` (défense en profondeur, pas de confiance au masquage sidebar).
- Cohérence visuelle : le nouveau groupe respecte le rendu `NavGroup` existant (rail iconOnly + tooltips, drawer mobile).
- Aucune régression de visibilité sur les groupes « Opérationnel » et « Référentiels » existants.
