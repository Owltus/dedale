# 0002 — Conventions de stack & outillage qualité

- **Date** : 2026-06-04
- **Statut** : accepté

## Contexte

Poser des fondations « vibecoding » durables : un cadre qui maintient la cohérence du code
sans re-discussion à chaque session, en s'appuyant sur les bonnes pratiques à jour de la stack
(Supabase + TanStack Query/Router/Form, React 19, TypeScript). Recherche web sourcée à l'appui
(TKDodo, docs officielles TanStack/Supabase, typescript-eslint 2026).

## Décision

**Outillage qualité**

- **ESLint strict typé** : `strictTypeChecked` + `stylisticTypeChecked` + `projectService`.
  Code généré exclu (`routeTree.gen.ts`, `database.types.ts`). 3 règles assouplies car en
  conflit avec des patterns idiomatiques : `no-non-null-assertion` (off), `only-throw-error`
  (off — TanStack fait `throw redirect()`), `react-refresh/only-export-components` (off —
  les routes exportent `Route`). `no-confusing-void-expression` avec `ignoreArrowShorthand`.
- **Prettier** séparé d'ESLint (pas de `eslint-plugin-prettier`), avec `prettier-plugin-tailwindcss`
  (tri des classes). Style : pas de point-virgule, guillemets simples, virgule finale.
- **tsconfig durci** : `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`. Alias `@/` → `src/`.
- Scripts npm : `format`, `typecheck`, `gen:types`.

**Conventions de code** (détaillées dans `CLAUDE.md`) : `queryOptions` par feature, `.throwOnError()`
systématique, `.maybeSingle()` pour les cas RLS-vides, search params validés Zod, gardes d'auth en
`beforeLoad`, types Supabase générés (jamais édités à la main).

**Garde-fous Claude Code**

- `.claude/settings.json` : allow-list des commandes sûres (npm/git hors push, tsc, eslint…).
- Hook `PostToolUse` (`.claude/hooks/check.mjs`) : type-check après chaque édition `.ts/.tsx`.

## Conséquences

- Le linter peut être bruyant sur du code legacy ou des libs ; on relâche au cas par cas, jamais en masse.
- Les types Supabase ne sont pas encore générés (nécessite `npx supabase login` une fois) :
  le client reste non typé en attendant, avec cast explicite ponctuel (ex. RPC `current_role`).
  À régénérer (`npm run gen:types`) dès que possible, puis typer le client `createClient<Database>`.
- Le hook ralentit légèrement chaque édition TS (type-check incrémental) — acceptable, gain de fiabilité.
