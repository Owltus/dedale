---
name: nouvelle-page
description: Crée une nouvelle page/écran de l'app Dédale (route TanStack Router protégée + feature) en respectant les conventions du projet. À utiliser quand l'utilisateur demande d'ajouter une page, un écran ou une vue.
---

# Créer une nouvelle page Dédale

Objectif : poser une page cohérente avec l'existant, sans repartir de zéro.

## Avant de coder

1. Lire `docs/conventions/architecture.md` (où ranger les fichiers, routing) et
   `docs/conventions/ui.md` (style, règle des 4 états, **section Responsive design**).
2. Si la page lit/écrit des données : lire `docs/conventions/donnees.md`.
3. S'assurer de comprendre le besoin : quelle entité, lecture seule ou CRUD, quels rôles/sites concernés. Demander si ambigu.

## Squelette à produire

1. **Route** dans `src/routes/` (file-based), protégée par `beforeLoad` (cf. `index.tsx` comme modèle) :
   - `beforeLoad: ({ context }) => { if (!context.auth.session) throw redirect({ to: '/login' }) }`
   - filtres/pagination éventuels → search params validés Zod (`validateSearch`).
2. **Feature** si métier : `src/features/<domaine>/` avec `queries.ts` (`queryOptions`, `.throwOnError()`, filtre `.is('deleted_at', null)`), `components/`, et `schemas.ts` (Zod) si formulaire.
3. **Affichage** via composants `@/components/ui` (Card, Button, Badge…) et tokens sémantiques. Pour toute liste de données, appliquer la **règle des 4 états** : `isPending` → Skeleton, `error` → `ErrorState`, vide → `EmptyState`, sinon données.
   - **Responsive obligatoire** : ouvrir la page sur `<PageContainer>` (jamais `p-6` nu) et utiliser `cardGrid` pour les grilles de cartes :
     ```tsx
     <PageContainer>
       <PageHeader title="…" action={…} />
       <div className={cardGrid.default}>{/* … */}</div>
     </PageContainer>
     ```
4. **Textes en français**, retours via `toast` (sonner).

## Après

- `npm run typecheck` et `npm run lint` doivent passer.
- Si une nouvelle décision d'archi est prise, l'ajouter dans `docs/decisions/`.
