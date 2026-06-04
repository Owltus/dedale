# Dédale

**GMAO** (gestion de maintenance) pour **Établissements Recevant du Public** — ERP français.
Une instance = une entreprise. Interface web adossée à un backend **Supabase** (PostgreSQL + Auth + Storage), où vivent toute la logique métier et la sécurité.

## Fonctionnalités

- **Lieux** : sites → bâtiments → niveaux → locaux → équipements
- **Demandes d'intervention** (curatif) et **ordres de travail** (préventif / réglementaire)
- **Gammes** de maintenance, **prestataires**, **contrats**, **investissements**
- **Documents** (PDF, images) rattachés aux entités
- **5 rôles** (admin · manager · technicien · lecteur · demandeur) avec accès par site

## Stack

- **Vite** + **React** + **TypeScript** (SPA)
- **TanStack** Router · Query · Table · Form + **Zod**
- **Tailwind CSS**
- **@supabase/supabase-js** (Auth, base, Storage)

## Démarrage

Prérequis : **Node 22+**.

```bash
# 1. Dépendances
npm install

# 2. Accès Supabase
cp .env.example .env.local
# puis renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY

# 3. Développement
npm run dev          # http://localhost:5181
```

## Scripts

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement (port 5181) |
| `npm run build` | Build de production (`dist/`) |
| `npm run preview` | Prévisualise le build |
| `npm run lint` | Analyse ESLint |

## Structure

```
src/
  routes/      Pages (TanStack Router, file-based)
  lib/         Client Supabase, utilitaires
  auth.tsx     Contexte d'authentification (session)
  main.tsx     Point d'entrée — Router + Query + Auth
```

## Architecture

Le front **présente**, la base **valide**. La sécurité repose sur le **rôle** de l'utilisateur
et ses **sites** accessibles, appliqués par les politiques **RLS** de Supabase — jamais côté client.
Une requête qui ne renvoie rien n'est pas une erreur : c'est la RLS qui filtre.

---

Projet interne — backend déployé séparément sur Supabase.
