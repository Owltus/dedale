# Dédale

**GMAO** (gestion de maintenance) pour **Établissements Recevant du Public** — ERP français.
Une instance = une entreprise. Interface web adossée à un backend **Supabase** (PostgreSQL + Auth + Storage + Edge Functions), où vivent toute la logique métier et la sécurité.

## Fonctionnalités

- **Lieux** : sites → bâtiments → niveaux → locaux → équipements
- **Demandes d'intervention** (curatif) et **ordres de travail** (préventif / réglementaire)
- **Plan de maintenance** (gammes), **prestataires**, **contrats**, **investissements**, **travaux**, **événements**, **relevés**
- **Documents** (PDF, images) rattachés aux entités
- **5 rôles** (admin · manager · technicien · lecteur · demandeur) avec accès par site
- **Synchro Dmbook** (carnet de liaison de l'établissement, ADR 0016) et **connecteur Claude** (MCP, ADR 0015)

## Stack

- **Vite** + **React 19** + **TypeScript** strict (SPA)
- **TanStack** Router · Query · Virtual — **react-hook-form** + **Zod**
- **Tailwind CSS 4** + **shadcn/ui**
- **@supabase/supabase-js** ; Edge Functions en **Deno**

## Prérequis

| Outil                       | Pour quoi                                                  |
| --------------------------- | ---------------------------------------------------------- |
| **Node 22+**                | tout                                                       |
| **Deno 2.9+**               | `npm run verify` (lint, types et tests des Edge Functions) |
| **Docker Desktop**          | la base locale jetable (`npm run base:monter`)             |
| Git (Git Bash sous Windows) | les hooks avant commit / avant poussée                     |

La CLI Supabase n'a pas à être installée : elle passe par `npx`.

## Démarrage

```bash
# 1. Dépendances (branche aussi les hooks git de .githooks/)
npm install

# 2. Accès au backend
cp .env.example .env.local
# puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

# 3. Développement
npm run dev          # http://localhost:5181 (port fixe)
```

### Sans accès à la production : la base locale jetable

```bash
npm run base:monter     # pile Supabase locale (Docker) + schema_complete.sql + comptes de test (~30 s)
npm run base:tester     # sondes de droits (RLS, Storage, escalade) et tests d'intégration
npm run base:demonter   # arrête la pile et efface ses volumes
```

`scripts/base-locale.mjs` refuse toute cible qui n'est pas `127.0.0.1` / `localhost` et toute commande liée à la prod. L'API locale répond sur `http://127.0.0.1:44521` (ports 445xx : Windows réserve souvent les plages 54xxx). Détail des sondes : `tests/securite/README.md`.

## Vérifier — les garde-fous

| Commande                | Quand                        | Ce qu'elle fait                                                                            |
| ----------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ |
| `npm run sante:rapide`  | avant chaque commit (hook)   | fichiers indexés : format, ESLint, conventions, secrets, fichiers interdits                |
| `npm run sante`         | avant chaque poussée (hook)  | `verify` + build + concordance du schéma + code mort (knip) + vulnérabilités du code livré |
| `npm run sante:complet` | avant une mise en production | en plus : clone propre, tests lancés deux fois, couverture (cliquet), base locale + sondes |
| `npm run verify`        | la gate                      | types + ESLint + Prettier + Vitest + Deno (lint, types, tests)                             |

Chaque point reçoit **OK**, **ÉCHEC** ou **NON VÉRIFIÉ** (outil absent : jamais compté OK ; `-- --strict` en fait un échec). La CI GitHub (`.github/workflows/sante.yml`) rejoue tout à chaque poussée. Les écarts anciens sont gelés (`src/lib/conventions-exceptions.json`, `couverture-plancher.json`) : la dette peut baisser, jamais monter. Décision : `docs/decisions/0017-garde-fous-permanents.md`.

## Scripts

| Commande                                                  | Effet                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                                             | serveur de développement (port 5181)                                        |
| `npm run build` / `preview`                               | build de production (`dist/`) / prévisualisation                            |
| `npm run typecheck` · `lint` · `format` · `format:check`  | types · ESLint · Prettier                                                   |
| `npm run test` · `test:couverture`                        | Vitest · Vitest avec couverture                                             |
| `npm run test:deno` · `deno:verifier`                     | tests Deno · lint + types + tests des Edge Functions                        |
| `npm run gen:types`                                       | régénère les types Supabase depuis la prod (`npx supabase login` d'abord)   |
| `npm run contraintes:instantane` · `contraintes:verifier` | instantané des contraintes SQL de la prod (oracle de concordance Zod ↔ SQL) |
| `npx stryker run`                                         | tests de mutation (`stryker.config.json`, hors gate : long)                 |

Outils de `scripts/` : `sante.mjs` (bilan), `secrets.mjs` (recherche de secrets), `couverture-cliquet.mjs` (couverture sans recul), `base-locale.mjs` (base jetable), `installer-hooks.mjs` (hooks git), `instantane-contraintes.mjs` + `contraintes-sql.sql` (instantané des contraintes).

## Structure

```
src/
  routes/        Pages (TanStack Router, file-based) — minces : gardes + cadre
  features/      Un dossier par domaine : components/, queries.ts, mutations.ts, schemas.ts…
  components/    ui/ (shadcn) · common/ (briques maison) · layout/ (coquille)
  hooks/ lib/    transverses ; lib/supabase.ts = client unique
  auth.tsx       contexte d'authentification
supabase/
  functions/     Edge Functions (Deno) : invite_user, set_user_password, update_user_email,
                 mcp (connecteur Claude), dmbook-connexion, dmbook-sync (synchro Dmbook)
supabase-local/  configuration de la base locale jetable
tests/securite/  sondes de droits (RLS, Storage, escalade) — base locale uniquement
tests/integration/ RPC transactionnelles jouées par chaque rôle (atomicité, refus hors site) — base locale
schema_complete.sql   schéma SQL versionné (rejouable en un passage)
docs/            conventions/ (règles du code) · decisions/ (ADR)
```

Secrets des Edge Functions (posés côté Supabase, jamais dans le dépôt) : `supabase/functions/.env.example`.

## Architecture

Le front **présente**, la base **valide**. La sécurité repose sur le **rôle** de l'utilisateur
et ses **sites** accessibles, appliqués par les politiques **RLS** de Supabase — jamais côté client.
Une requête qui ne renvoie rien n'est pas une erreur : c'est la RLS qui filtre.

Conventions de code : `CLAUDE.md` et `docs/conventions/`.

---

Projet interne — backend déployé séparément sur Supabase.
