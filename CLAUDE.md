# Dédale — application front (GMAO)

Interface web d'une **GMAO single-tenant** pour Établissements Recevant du Public (ERP français).
Le **backend Supabase est déjà déployé** et porte **toute** la logique métier + la sécurité (RLS).
Le front ne fait que **présenter et consommer** l'API. **Règle d'or : le front présente, la base valide.**

## Commandes

- `npm run dev` — dev sur **http://localhost:5181** (port fixe). Raccourci : `dev.bat`.
- `npm run build` — build de prod. `npm run typecheck` — `tsc -b`. `npm run lint` — ESLint. `npm run format` — Prettier.
- `npm run gen:types` — régénère les types Supabase (après `npx supabase login`, à relancer après chaque migration backend).

## Stack

Vite + React 19 + TypeScript · **TanStack** Router (routes file-based) · Query · Table · Form + **Zod** · **Tailwind 4** + **shadcn/ui** · `@supabase/supabase-js`. Alias d'import **`@/`** → `src/`.

## Conventions détaillées — À LIRE selon le sujet (chargement à la demande)

> Garder ces fichiers courts en contexte : ne les ouvrir que quand le sujet le concerne.

| Quand je travaille sur…                                | Lire d'abord                       |
| ------------------------------------------------------ | ---------------------------------- |
| structure, routes, où ranger un fichier, nommage       | `docs/conventions/architecture.md` |
| lecture/écriture Supabase, TanStack Query, formulaires | `docs/conventions/donnees.md`      |
| style, couleurs, thème, monter un écran                | `docs/conventions/ui.md`           |
| créer un composant, un modal, où le mettre             | `docs/conventions/composants.md`   |

Décisions d'archi tranchées : `docs/decisions/`.

## Doctrine backend à respecter (NON négociable — toujours active)

1. **Single-tenant** : pas de notion de « client ». Tout appartient à l'unique entreprise.
2. **Sécurité = rôle + sites** (RLS). 5 rôles : `admin` · `manager` · `technicien` · `lecteur` · `demandeur`. On raisonne « mes sites », **jamais** d'assignation nominative.
3. **RLS = résultat vide, pas erreur** en lecture (→ `.maybeSingle()` si l'absence est normale). Un INSERT/UPDATE hors scope renvoie une **erreur** (`42501`) à catcher.
4. **Soft-delete** : toujours filtrer `.is('deleted_at', null)` sur les listes.
5. **Machines à états** : une transition interdite renvoie une **erreur** → catcher et afficher proprement.
6. **Upload document = 3 étapes** : Storage → insert `documents` (avec `site_id`) → insert table de liaison.
7. **Helpers/RPC en `public.`** (jamais `auth.xxx()` sauf `auth.uid()`). RPC : `current_role`, `get_my_sites`, `copier_gamme`, `instancier_equipement`, `reouvrir_ot`…
8. Hiérarchie des lieux : `sites → batiments → niveaux → locaux → equipements`.

## Conventions de code (toujours actives)

- **Tout en français** (UI, libellés, commentaires, erreurs) — accents corrects, jamais d'ASCII dégradé.
- **TypeScript strict** ; pas de `any`. Erreurs Supabase **toujours gérées** (`.throwOnError()` + UI).
- **ESLint strict + Prettier** : ne pas formater ni trier les classes Tailwind à la main.
- Couleurs : **tokens sémantiques** (`bg-primary`…), jamais en dur. Coller au style du code existant.

## Garde-fous automatiques

- **Hook** `.claude/hooks/check.mjs` (PostToolUse) : type-check après chaque édition `.ts`/`.tsx`.
- **Allow-list** `.claude/settings.json` : npm/git (hors push)/tsc/eslint sans confirmation. Push et suppressions confirmés.

## Repères & pièges

- Backend (source de vérité) : `C:\Users\Pierre-Louis\Desktop\supa`. Doc & schéma du projet : `contexte/` (**gitignoré**).
- Dépôt : `github.com/Owltus/dedale` (public, `main`).
- Port **5181** (5180 = autre projet de l'utilisateur). `contexte/`, `dev.bat`, `.claude/settings.local.json` gitignorés. `.env.local` jamais commité.
- Compte créé en SQL à la main → mettre les colonnes de tokens NULL d'`auth.users` à `''` (sinon login 500 GoTrue).
