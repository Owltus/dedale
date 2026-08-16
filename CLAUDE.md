# Dédale — application front (GMAO)

Interface web d'une **GMAO single-tenant** pour Établissements Recevant du Public (ERP français).
Le **backend Supabase est déjà déployé** et porte **toute** la logique métier + la sécurité (RLS).
Le front ne fait que **présenter et consommer** l'API. **Règle d'or : le front présente, la base valide.**

## Commandes

- `npm run dev` — dev sur **http://localhost:5181** (port fixe). Raccourci : `dev.bat`.
- `npm run build` — build de prod. `npm run typecheck` — `tsc -b`. `npm run lint` — ESLint. `npm run format` — Prettier.
- `npm run gen:types` — régénère les types Supabase (après `npx supabase login`, à relancer après chaque migration backend).

## Stack

Vite + React 19 + TypeScript · **TanStack** Router (routes file-based) · Query · Table · **react-hook-form** + **Zod** (formulaires, via `zodResolver`) · **Tailwind 4** + **shadcn/ui** · `@supabase/supabase-js`. Alias d'import **`@/`** → `src/`.

## Conventions détaillées — À LIRE selon le sujet (chargement à la demande)

> Garder ces fichiers courts en contexte : ne les ouvrir que quand le sujet le concerne.

| Quand je travaille sur…                                | Lire d'abord                       |
| ------------------------------------------------------ | ---------------------------------- |
| structure, routes, où ranger un fichier, nommage       | `docs/conventions/architecture.md` |
| lecture/écriture Supabase, TanStack Query, formulaires | `docs/conventions/donnees.md`      |
| style, couleurs, thème, responsive, monter un écran    | `docs/conventions/ui.md`           |
| créer un composant, un modal, où le mettre             | `docs/conventions/composants.md`   |

Décisions d'archi tranchées : `docs/decisions/`.

## Skills — les procédures, pas les conventions

Les conventions ci-dessus disent **ce qui est vrai** ; les skills disent **comment faire**. Chacun est la source unique de son sujet : ne pas recopier ses règles ailleurs.

| Tâche                                                | Skill             |
| ---------------------------------------------------- | ----------------- |
| créer ou refondre une page / un écran                | `nouvelle-page`   |
| créer ou câbler une modale                           | `modale`          |
| extraire ou faire adopter un composant partagé       | `brique-commune`  |
| écrire une migration SQL et resynchroniser le schéma | `migration-sql`   |
| vérifier qu'un écran est aligné sur les patrons      | `revue-coherence` |
| vérifier qui voit quoi (RLS, Storage, rôles)         | `audit-rls`       |
| mettre en production (migrations, types, Vercel)     | `deployer`        |

Le **catalogue des ~60 briques réutilisables** (avec leur nombre réel de consommateurs) vit dans `.claude/skills/nouvelle-page/references/catalogue-composants.md` — **le consulter avant d'écrire un composant**, et le mettre à jour après.

## Doctrine backend à respecter (NON négociable — toujours active)

1. **Single-tenant** : pas de notion de « client ». Tout appartient à l'unique entreprise.
2. **Sécurité = rôle + sites** (RLS). 5 rôles : `admin` · `manager` · `technicien` · `lecteur` · `demandeur`. On raisonne « mes sites », **jamais** d'assignation nominative.
3. **RLS = résultat vide, pas erreur** en lecture (→ `.maybeSingle()` si l'absence est normale). Un INSERT/UPDATE hors scope renvoie une **erreur** (`42501`) à catcher.
4. **Hard-delete** : la colonne `deleted_at` **n'existe plus** (migrations 034-036). Ne jamais filtrer dessus. Les garde-fous sont les FK : `RESTRICT` (conteneur non vide → suppression bloquée, à présenter via `blocked`/`blockedReason`) ou `CASCADE` (liaisons retirées — le dire dans le `warning` de la modale).
5. **Machines à états** : une transition interdite renvoie une **erreur** → catcher et afficher proprement.
6. **Upload document = 3 étapes** : Storage → insert `documents` (avec `site_id`) → insert table de liaison.
7. **Helpers/RPC en `public.`** (jamais `auth.xxx()` sauf `auth.uid()`). RPC : `current_role`, `get_my_sites`, `copier_gamme`, `instancier_equipement`, `reouvrir_ot`…
8. Hiérarchie des lieux : `sites → batiments → niveaux → locaux → equipements`.

## Conventions de code (toujours actives)

- **Tout en français** (UI, libellés, commentaires, erreurs) — accents corrects, jamais d'ASCII dégradé.
- **TypeScript strict** ; pas de `any`. Erreurs Supabase **toujours gérées** (`.throwOnError()` + UI).
- **ESLint strict + Prettier** : ne pas formater ni trier les classes Tailwind à la main.
- Couleurs : **tokens sémantiques** (`bg-primary`…), jamais en dur. Coller au style du code existant.
- **Mobile-first** : toute page s'ouvre sur `<PageContainer>`, grilles via `cardGrid` (`src/lib/responsive.ts`). Détails : `docs/conventions/ui.md` → Responsive design.

## Garde-fous automatiques

- **Hook** `.claude/hooks/check.mjs` (PostToolUse) : après chaque édition `.ts`/`.tsx`, **formate le fichier édité** (Prettier) puis lance le type-check. Le formatage est non bloquant ; seule une erreur de types remonte.
- **Gate** : `npm run verify` = typecheck + lint + format + tests. C'est la seule commande à lancer en fin de chantier (avec `npm run build`).
- **Allow-list** `.claude/settings.json` : npm/git (hors push)/tsc/eslint/prettier sans confirmation. Tout ce qui n'y figure pas — dont `git push` et les suppressions de fichiers — demande une confirmation ; il n'y a pas de liste `deny` explicite.

## Repères & pièges

- **Schéma SQL (source de vérité) : `schema_complete.sql` à la racine** (seed unique, versionné) ; historique incrémental dans `migrations/` (racine, **gitignoré / local** — dépôt public : les migrations peuvent contenir des données réelles, on ne les publie pas). À chaque migration → resynchroniser `schema_complete.sql` (**seule source versionnée**). Le projet `C:\Users\Pierre-Louis\Desktop\supa` est **déprécié**. Doc interne du projet : `contexte/` (**gitignoré**).
- Dépôt : `github.com/Owltus/dedale` (public, `main`).
- Port **5181** (5180 = autre projet de l'utilisateur). `contexte/`, `dev.bat`, `.claude/settings.local.json` gitignorés. `.env.local` jamais commité.
- Compte créé en SQL à la main → mettre les colonnes de tokens NULL d'`auth.users` à `''` (sinon login 500 GoTrue).
