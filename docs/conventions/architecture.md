# Conventions — Architecture du code

> Lue quand on crée/déplace des fichiers, des routes ou qu'on structure une feature.

## Arborescence

```
src/
  routes/            # Routing file-based TanStack Router (l'URL = l'arbre).
                     # MINCE : createFileRoute + gardes (beforeLoad) + cadre
                     # SiteScopedRoute ; l'écran vit dans sa feature (cf. ci-dessous).
  features/          # Cœur métier. Une feature = un dossier autonome.
    <domaine>/
      components/    # composants métier (EquipementDetail, ContratCard…)
        <x>-liste.tsx  # l'ÉCRAN liste de la route (TravauxListe, DemandesListe…)
      page-meta.ts   # identité de la page : titre / description / hint / icone
      queries.ts     # queryOptions (lecture) — cf. conventions/donnees.md
      mutations.ts   # hooks useMutation (écriture)
      schemas.ts     # schémas Zod (réutilisés par form ET search params)
      etat.ts        # statuts nommés et prédicats (STATUT_DI_CLOTURE, estVerrouille…)
    taches/          # tâches partagées par Travaux et Événements (diff, ligne, dialogue)
  components/
    ui/              # composants génériques shadcn/ui (button, card, dialog…). Zéro métier.
    common/          # briques réutilisables maison (EmptyState, PageHeader, ListRow…)
    layout/          # coquille de l'application : sidebar, barre du haut, en-tête
                     # mobile, menu utilisateur, sélecteur de site, préchargement
    theme.tsx        # ThemeProvider + useTheme (clair/sombre)
  lib/               # transverse sans métier : supabase.ts, date.ts, erreurs.ts
                     # (traduction des erreurs), recherche.ts, pagination.ts…
  auth.tsx           # AuthProvider + useAuth
  hooks/             # hooks transverses (useEntityDialog, useConfirmDelete, useRealtimeRefresh…)
  main.tsx           # point d'entrée (Query + Theme + Auth + Router)
```

Une brique qui ne sert qu'un domaine vit dans ce domaine, même si plusieurs
fiches l'emploient (`DocumentsTab` → `features/documents/components`). Un hook
qui n'a qu'un consommateur vit à côté de lui (`use-gammes-drill` → `features/gammes`).

## Règles de dépendances (réalistes, mesurées le 24/11/2026)

- `components/ui` n'importe **jamais** depuis `features/` ni `common/`.
- `lib/` et `hooks/` n'importent une feature que pour le **socle** : le rôle
  courant (`features/utilisateurs/queries` → `currentRoleQueryOptions`) et le
  site actif (`features/sites/site-context`). Rien d'autre.
- `components/common` peut lire ce même socle (site actif, sites) ; il n'importe
  aucun composant de feature.
- **Features socle**, importables par toutes : `sites` (site actif), `utilisateurs`
  (rôle), `documents` (format, briques de fiche), `miniatures` (vignettes),
  `taches`. Entre deux autres features, on importe les **queries**, **schemas**,
  **format** et **types** de l'autre — jamais l'inverse d'une dépendance déjà
  posée (pas de cycle). Une clé de cache d'une autre feature se dérive de sa
  fabrique (`...ordresTravailQueries.all()`), jamais d'un littéral ; si la
  feature n'en a besoin QUE pour invalider et que l'import créerait un cycle,
  elle prend la racine dans `lib/cles-racines.ts` (qui définit la fabrique).
  Les référentiels globaux (périodicités, types d'opération, unités) vivent
  dans `lib/referentiel.ts` (`referentielsQueries`).
- **Sens posés** (aucun cycle, imports relatifs compris) : `gammes` →
  `ordres-travail`, `equipements`, `prestataires` ; `evenements` → `travaux`.
  Quand l'écran du « bas » doit montrer une brique du « haut » (onglet Gammes
  d'un équipement ou d'un prestataire, conversion en Événement, natures du
  filtre OT), la **route l'injecte** par prop (`gammes={…}`,
  `GammesPanel={…}`, `ConvertirEnEvenement={…}`, `natures={…}`).

## Glossaire (validé par le PO le 24/11/2026)

| Concept                             | Dans le code                            | À l'écran                          |
| ----------------------------------- | --------------------------------------- | ---------------------------------- |
| Pièce, zone                         | `local` (`locaux`)                      | « lieu »                           |
| Catalogue du siège (`site_id NULL`) | `commun` (`entreprise` pour une portée) | « commun »                         |
| Gamme                               | `gamme`                                 | « Plan de maintenance » (section)  |
| Ordre de travail                    | `ot`, `ordres_travail`                  | « OT », « Ordre de travail »       |
| Demande d'intervention              | `demande`, `di`                         | « DI », « Demande d'intervention » |

Verbes : les hooks CRUD gardent l'anglais (`useCreate…`, `useUpdate…`,
`useDelete…`) ; tout le reste est en français (`estVerrouille`, `poserRetenus`).
Droits : `can…` ; prédicats métier : `est…`.

## Routing (TanStack Router)

- Routes dans `src/routes/`, file-based. `routeTree.gen.ts` est **généré** (ne pas éditer/linter).
- **Garde d'auth dans `beforeLoad`** (avant rendu, pas de flash), via `context.auth.session` → `throw redirect({ to: '/login' })`. Jamais un garde via hook dans le composant.
- **Garde de rôle dans `beforeLoad`** : `requireNav(navKey, context.queryClient)` (`lib/nav-guard.ts`) résout le rôle via `queryClient.ensureQueryData` puis redirige vers `landingFor(role)` si l'écran ne lui est pas destiné. Même source que la sidebar (`lib/nav.ts`) → une seule vérité. Fail-open si le rôle est indisponible (la RLS reste la sécurité). N'empêche pas la RLS : c'est de l'UX, pas de la sécurité.
- Après login/logout, `router.invalidate()` pour relancer les gardes.
- Ne jamais avaler un `redirect` dans un `catch` : `if (isRedirect(err)) throw err`.
- **Filtres de liste = état local** (`useState` dans la page), jamais un state global ni `window.location`. Les search params (`validateSearch` écrit à la main comme garde de type, lu via `Route.useSearch()`) sont réservés aux vues partageables par lien : voir `composants.md` → puce « Vues partageables par lien ».

## Nommage

- Composants (le symbole) : `PascalCase`. Convention métier : `<Entité>Card`, `<Entité>Detail`, `<Entité>FormDialog`.
- Fichiers de composants (le fichier) : **`kebab-case.tsx` partout**, `ui/`, `common/` **et** `features/` — ex. `site-form-dialog.tsx` exportant `SiteFormDialog`. Aucune exception.
- Imports : alias **`@/`** pour tout `src/` (pas de `../../../`).

## Contrôlé par

Les règles ne sont pas recopiées ici : chaque contrôle porte son message et renvoie à cette page. Exceptions gelées et motivées : `src/lib/conventions-exceptions.json` (un écart nouveau est rouge, une exception devenue inutile aussi).

- **ESLint** (`eslint.config.js`, blocs « Conventions ») : règles de dépendances `components/ui`, `lib/`, `hooks/`, `components/common`.
- **`src/lib/conventions.test.ts`** : `route-mince`, `cycle-features`, `cle-litterale`, `nommage-hooks-crud`, `dossier-non-documente` (un dossier de `supabase/functions/`, `scripts/` ou `tests/` cité nulle part dans CLAUDE.md ni README.md).

**Contrôlé par la revue (non automatisable)** : garde d'auth et de rôle dans `beforeLoad` (pas dans un hook) ; `isRedirect` relancé dans un `catch` ; filtres de liste en état local ; une brique d'un seul domaine reste dans ce domaine ; nommage métier (`<Entité>Card`, `<Entité>Detail`…), fichiers en `kebab-case`, alias `@/` ; glossaire à l'écran (« lieu », « Plan de maintenance »).
