# Dédale — application front (GMAO)

Interface web d'une **GMAO single-tenant** pour Établissements Recevant du Public (ERP français).
Le **backend Supabase est déjà déployé** et porte **toute** la logique métier + la sécurité (RLS).
Le front ne fait que **présenter et consommer** l'API. **Règle d'or : le front présente, la base valide.**

## Commandes

- `npm run dev` — dev sur **http://localhost:5181** (port fixe). Raccourci : `dev.bat`.
- `npm run build` — build de prod. `npm run typecheck` — `tsc -b`. `npm run lint` — ESLint. `npm run format` — Prettier.
- `npm run gen:types` — régénère les types Supabase (après `npx supabase login`, à relancer après chaque migration backend).
- `npm run test` (Vitest) · `npm run deno:verifier` (format + lint + types + tests des Edge Functions, **Deno requis**) · `npm run test:couverture`.
- `npm run sante` / `sante:rapide` / `sante:complet` — bilan de santé (voir « Garde-fous automatiques »).
- `npm run base:monter` / `base:tester` / `base:demonter` — **base locale jetable** (Docker) depuis `schema_complete.sql`, comptes de test, sondes RLS (`tests/securite/`) et tests d'intégration (`tests/integration/`). Jamais la prod. Prérequis et détails : `README.md`.

## Stack

Vite + React 19 + TypeScript · **TanStack** Router (routes file-based) · Query · **react-hook-form** + **Zod** (formulaires, via `zodResolver`) · **Tailwind 4** + **shadcn/ui** · `@supabase/supabase-js`. Alias d'import **`@/`** → `src/`.

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

| Tâche                                                     | Skill                    |
| --------------------------------------------------------- | ------------------------ |
| créer ou refondre une page / un écran                     | `nouvelle-page`          |
| créer ou câbler une modale                                | `modale`                 |
| extraire ou faire adopter un composant partagé            | `brique-commune`         |
| écrire une migration SQL et resynchroniser le schéma      | `migration-sql`          |
| vérifier qu'un écran est aligné sur les patrons           | `revue-coherence`        |
| vérifier qui voit quoi (RLS, Storage, rôles)              | `audit-rls`              |
| tester/vérifier directement sur Supabase (hors migration) | `bob-assistant-supabase` |
| mettre en production (migrations, types, Vercel)          | `deployer`               |

Le **catalogue des briques réutilisables** (~70 documentées, avec leur nombre réel de consommateurs, **mesuré**) vit dans `.claude/skills/nouvelle-page/references/catalogue-composants.md` — **le consulter avant d'écrire un composant**, et le mettre à jour après. Il ne couvre volontairement pas `components/ui/` (primitives shadcn).

## Doctrine backend à respecter (NON négociable — toujours active)

1. **Single-tenant** : pas de notion de « client ». Tout appartient à l'unique entreprise.
2. **Sécurité = rôle + sites** (RLS). 5 rôles : `admin` · `manager` · `technicien` · `lecteur` · `demandeur`. On raisonne « mes sites », **jamais** d'assignation nominative.
3. **RLS = résultat vide, pas erreur** en lecture (→ `.maybeSingle()` si l'absence est normale). Un INSERT/UPDATE hors scope renvoie une **erreur** (`42501`) à catcher.
4. **Hard-delete** : la colonne `deleted_at` **n'existe plus** (migrations 034-036). Ne jamais filtrer dessus. Les garde-fous sont les FK : « bloquer » (`NO ACTION`, le défaut, ou `RESTRICT` — préférer `NO ACTION`, qui laisse passer une suppression en cascade alors que `RESTRICT` la casse ; conteneur non vide → suppression bloquée, à présenter via `blocked`/`blockedReason`) ou `CASCADE` (liaisons retirées — le dire dans le `warning` de la modale).
5. **Machines à états** : une transition interdite renvoie une **erreur** → catcher et afficher proprement.
6. **Upload document = 3 étapes** : Storage → insert `documents` (avec `site_id`) → insert table de liaison.
7. **Helpers/RPC en `public.`** (jamais `auth.xxx()` sauf `auth.uid()`). RPC : `current_role`, `get_my_sites`, `copier_gamme`, `deployer_equipements` (déploiement en masse, aperçu puis application, lot annulable par `annuler_deploiement`), `installer_modele_equipement` (installe une copie d'un modèle du commun ET sa flotte en une transaction), `reouvrir_ot`…
8. Hiérarchie des lieux : `sites → batiments → niveaux → locaux → equipements`.
9. **Caractéristiques libres** : le gabarit vit sur le CONTENEUR (`categories.specifications` pour un équipement, `types_locaux.specifications` pour un local), les valeurs sur l'objet (`equipements.specifications`, `locaux.specifications`) qui en garde un **snapshot**. Ne jamais ajouter une colonne fixe pour un besoin propre à un type.
10. **Catalogue commun = RÉSERVE, pas source vive** (ADR 0009). `site_id NULL` = catalogue du siège (modèles d'équipements/d'opérations, gammes-templates, modèles de DI) ; `site_id` renseigné = ce qui vit sur un site. Un écran de SITE ne propose **que** ce qui est sur le site — le commun ne s'y montre jamais (règle portée par les **queries**, pas par les composants : `modelesEquipementsQueries.list`, `modelesOperationsQueries.liables`, `modelesDiDuSiteQueries.list` (`src/features/demandes/queries.ts`), `gammesQueries.list`). Pour l'utiliser, un site en **installe une copie** depuis la Bibliothèque (« Importer depuis le commun » → RPC `copier_modele_equipement` (ou `installer_modele_equipement` pour copie + flotte, bouton « Installer et déployer ») / `copier_modele_operation` / `copier_gamme`, ouvertes aux rôles métier ayant accès au site) ; la copie est indépendante. Garde-fous base : `check_categorie_modele` (une sous-catégorie de parc ne pointe qu'un modèle de SON site) et `check_gamme_modele_meme_perimetre` (113).

## Conventions de code (toujours actives)

- **Tout en français** (UI, libellés, commentaires, erreurs) — accents corrects, jamais d'ASCII dégradé.
- **TypeScript strict** ; pas de `any`. Erreurs Supabase **toujours gérées** (`.throwOnError()` + UI).
- **ESLint strict + Prettier** : ne pas formater ni trier les classes Tailwind à la main.
- Couleurs : **tokens sémantiques** (`bg-primary`…), jamais en dur. Coller au style du code existant.
- **Mobile-first** : toute page s'ouvre sur `<PageContainer>`, grilles via `cardGrid` (`src/lib/responsive.ts`). Détails : `docs/conventions/ui.md` → Responsive design.
- **Glossaire** : « local » dans le code, « lieu » à l'écran ; « commun » = catalogue du siège ; « gamme » dans le code, « Plan de maintenance » à l'écran ; OT, DI. Hooks CRUD en anglais (`useCreate…`/`useUpdate…`/`useDelete…`), tout le reste en français ; droits `can…`, prédicats `est…`. Détail : `docs/conventions/architecture.md`.
- **Routes minces** : la route ne porte que `createFileRoute`, ses gardes et `SiteScopedRoute` ; l'écran vit dans `features/<x>/components/<x>-liste.tsx`. Coquille de l'appli dans `components/layout/`.
- **Données** (détail : `docs/conventions/donnees.md`) : écriture sur plusieurs tables = **une RPC transactionnelle**, jamais un enchaînement de requêtes ; liste qui grossit = `infiniteQueryOptions` ou `toutesLesLignes` (jamais de lecture nue, plafond silencieux à 1 000) ; paramètre absent = `skipToken` ; recherche = `lib/recherche.ts` ; clé d'une autre feature = sa fabrique, jamais un littéral ; temps réel = tables publiées seulement (`TablePubliee`) ; statuts = constantes nommées (`etat.ts`), jamais `=== 3`.
- **React Compiler** actif : pas de `useMemo`/`useCallback` dans le nouveau code.

## Garde-fous automatiques

- **Hook** `.claude/hooks/check.mjs` (PostToolUse) : après chaque édition `.ts`/`.tsx`, **formate le fichier édité** (Prettier) puis lance le type-check. Le formatage est non bloquant ; seule une erreur de types remonte.
- **Gate** : `npm run verify` = typecheck + lint + format + tests (Vitest **et** Deno des Edge Functions : lint, types, tests). Un commit ne part que si elle est verte.
- **Bilan de santé** (ADR 0017) : `npm run sante` donne OK / ÉCHEC / NON VÉRIFIÉ par point (verify, build, concordance du schéma, code mort knip, vulnérabilités, secrets, conventions). Fin de chantier : `npm run sante` ; avant une mise en prod : `npm run sante:complet` (clone propre, tests ×2, couverture, base locale).
- **Hooks git** (`.githooks/`, posés par `npm install`) : avant commit → `sante:rapide` ; avant poussée → `sante`. **CI** `.github/workflows/sante.yml` à chaque poussée. Ne jamais contourner (`--no-verify`) sans le dire au PO.
- **Cliquet** : les conventions sont contrôlées par ESLint et `src/lib/conventions.test.ts` ; les écarts anciens sont gelés dans `src/lib/conventions-exceptions.json` (avec motif), la couverture dans `couverture-plancher.json`. Un nouvel écart est rouge ; corriger un écart = retirer son exception dans le même commit ; ajouter une exception = motif métier obligatoire. Un nouveau dossier de `scripts/`, `tests/` ou `supabase/functions/` doit être cité ici ou dans le README.
- **Allow-list** `.claude/settings.json` : npm/git (hors push)/tsc/eslint/prettier sans confirmation. Tout ce qui n'y figure pas — dont `git push` et les suppressions de fichiers — demande une confirmation ; il n'y a pas de liste `deny` explicite.

## Repères & pièges

- **Schéma SQL (source de vérité) : `schema_complete.sql` à la racine** (seed unique, versionné) ; historique incrémental dans `migrations/` (racine, **gitignoré / local** — dépôt public : les migrations peuvent contenir des données réelles, on ne les publie pas). À chaque migration → resynchroniser `schema_complete.sql` (**seule source versionnée**). Le projet `C:\Users\Pierre-Louis\Desktop\supa` est **déprécié**. `contexte/` est un nom **réservé et gitignoré** pour la doc interne — il peut être absent d'une machine donnée, ne rien y chercher par défaut.
- Dépôt : `github.com/Owltus/dedale` (public, `main`).
- Port **5181** (5180 = autre projet de l'utilisateur). `contexte/`, `dev.bat`, `.claude/settings.local.json` gitignorés. `.env.local` jamais commité.
- Compte créé en SQL à la main → mettre les colonnes de tokens NULL d'`auth.users` à `''` (sinon login 500 GoTrue).
- **Edge Functions** (`supabase/functions/`, Deno) : `invite_user`, `set_user_password`, `update_user_email` (comptes), `mcp` (connecteur Claude, ADR 0015), `dmbook-connexion` + `dmbook-sync` (synchro Dmbook, ADR 0016, pg_cron toutes les 5 min). Secrets côté Supabase, documentés dans `supabase/functions/.env.example` (`DMBOOK_ECRITURE`, `DMBOOK_SYNC_REEL` : changer leur valeur = décision du PO). Déployer une fonction = mise en prod (skill `deployer`).
- **Tests de mutation** : `npx stryker run` (`stryker.config.json`), hors gate car long.
