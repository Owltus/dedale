# Étape 1 — Types Supabase & patron de feature

## Objectif

Disposer d'un client Supabase **typé de bout en bout** et d'un **patron de feature** réutilisable,
pour que tous les modules métier suivants soient écrits de la même façon.

## Pré-requis

- `npx supabase login` (une fois, action utilisateur) — sinon `gen:types` échoue.

## Fichier(s) impacté(s)

- `src/lib/database.types.ts` (nouveau, généré — ne jamais éditer à la main)
- `src/lib/supabase.ts` (typer `createClient<Database>`)
- `src/features/_exemple/queries.ts` (gabarit de référence, optionnel)

## Travail à réaliser

1. `npm run gen:types` → génère `database.types.ts` depuis le schéma déployé.
2. `createClient<Database>(...)` dans `supabase.ts` → `.from()`/`.rpc()` deviennent typés.
   Supprimer les casts temporaires (ex. RPC `current_role` dans `routes/index.tsx`).
3. Figer le **patron de feature** (cf. `docs/conventions/architecture.md` + `donnees.md`) :
   `features/<domaine>/{queries.ts, mutations.ts, schemas.ts, components/}`.
   `queries.ts` = `queryOptions` avec `.throwOnError()` + filtre `.is('deleted_at', null)`.
4. (Option) un petit helper de typage `Tables<'x'>`, `TablesInsert<'x'>` réexporté depuis `lib/`.

## Critère de validation

- `npm run typecheck` passe ; un `supabase.from('sites').select()` propose l'autocomplétion.
- Plus aucun cast `as ...` sur les appels Supabase existants.
