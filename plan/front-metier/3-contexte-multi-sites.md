# Étape 3 — Contexte multi-sites

## Objectif

Gérer la dimension **site** partout : un sélecteur de site dans le header et un `useSiteContext()`
que les écrans métier utilisent pour filtrer/scoper.

## Contexte

Tout le métier est scopé par site (RLS). `get_my_sites()` renvoie les sites accessibles.
**Cas particulier admin** : `get_my_sites()` peut renvoyer la liste complète ; l'admin voit tous les sites.

## Fichier(s) impacté(s)

- `src/features/sites/queries.ts` (RPC `get_my_sites`)
- `src/components/common/SiteSwitcher.tsx`
- `src/lib/site-context.tsx` (provider + hook `useSiteContext`)

## Travail à réaliser

1. Charger `get_my_sites()` via TanStack Query.
2. Provider `SiteContext` : site actif (persisté localStorage), liste des sites accessibles,
   option « tous les sites » si plusieurs (ou pour l'admin).
3. `SiteSwitcher` dans le header (caché s'il n'y a qu'un seul site).
4. Convention : les `queryOptions` métier prennent le `siteId` actif dans leur clé.

## Critère de validation

- Le site actif est lisible partout via `useSiteContext()` et persiste au rechargement.
- Avec un seul site, le sélecteur est masqué et le site est auto-sélectionné.
