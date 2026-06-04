# Conventions — Architecture du code

> Lue quand on crée/déplace des fichiers, des routes ou qu'on structure une feature.

## Arborescence

```
src/
  routes/            # Routing file-based TanStack Router (l'URL = l'arbre).
                     # MINCE : une route compose depuis features/, pas de logique métier ici.
  features/          # Cœur métier. Une feature = un dossier autonome.
    <domaine>/
      components/    # composants métier (EquipementCard, EquipementTable…)
      queries.ts     # queryOptions (lecture) — cf. conventions/donnees.md
      mutations.ts   # hooks useMutation (écriture)
      schemas.ts     # schémas Zod (réutilisés par form ET search params)
  components/
    ui/              # composants génériques shadcn/ui (button, card, dialog…). Zéro métier.
    common/          # transverses maison (EmptyState, ErrorState, ModeToggle, PageHeader…)
    theme.tsx        # ThemeProvider + useTheme (clair/sombre)
  lib/               # transverse : supabase.ts (client), utils.ts (cn), database.types.ts (généré)
  auth.tsx           # AuthProvider + useAuth
  hooks/             # hooks transverses (useDebounce…)
  main.tsx           # point d'entrée (Query + Theme + Auth + Router)
```

## Règles de dépendances

- Sens unique : `features/` → `components/common` → `components/ui` → `lib`. Jamais l'inverse.
- Un composant `components/ui` n'importe **jamais** depuis `features/`.
- Pas de dépendance croisée entre features : ce qui est partagé remonte dans `common/` ou `lib/`.
- **Colocation** : un composant métier vit dans sa feature, là où il sert.

## Routing (TanStack Router)

- Routes dans `src/routes/`, file-based. `routeTree.gen.ts` est **généré** (ne pas éditer/linter).
- **Garde d'auth dans `beforeLoad`** (avant rendu, pas de flash), via `context.auth.session` → `throw redirect({ to: '/login' })`. Jamais un garde via hook dans le composant.
- Après login/logout, `router.invalidate()` pour relancer les gardes.
- Ne jamais avaler un `redirect` dans un `catch` : `if (isRedirect(err)) throw err`.
- **Filtres / pagination / onglets = search params** validés Zod (`validateSearch` + `zodValidator`, `fallback()`), jamais un state global ni `window.location`. MAJ avec updater fonctionnel : `search={(prev) => ({ ...prev, page: prev.page + 1 })}`.

## Nommage

- Composants : `PascalCase`. Convention métier systématique : `<Entité>Card`, `<Entité>Table`, `<Entité>Form`, `<Entité>DetailDialog` → une nouvelle page = remplir le même squelette.
- Fichiers de composants : `kebab-case.tsx` (aligné shadcn) pour `ui/`/`common/` ; suivre l'existant.
- Imports : alias **`@/`** pour tout `src/` (pas de `../../../`).
