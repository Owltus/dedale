# Étape 4 — Balayage des pages standard

## Objectif

Appliquer les primitives de l'étape 1 à toutes les pages « liste + détail » qui
partagent les mêmes défauts (racine `p-6` figée, grilles de cartes sans
breakpoints). C'est le balayage de masse qui rend la majorité de l'app responsive.

## Contexte

Le pattern fautif est partout identique : `<div className="p-6">` en racine et des
grilles `grid-cols-[repeat(auto-fill,minmax(NNrem,1fr))]` qui ne descendent pas
proprement sous 360px. Le remplacement est mécanique grâce à `PageContainer` et
`cardGrid`.

## Fichier(s) impacté(s)

- `src/routes/_app/index.tsx`, `gammes.tsx`, `ordres-travail.tsx`,
  `equipements.tsx`, `demandes.tsx`, `releves.tsx`, `chantiers.tsx`,
  `prestataires.tsx`, `localisations.tsx`, `sites.tsx`, `investissements.tsx`,
  `utilisateurs.tsx`, `registre.tsx`, `documents.tsx`
- Les composants de détail associés dans `src/features/*/components/*` qui
  utilisent une grille `grid-cols-2` figée (ex. listes de paires clé/valeur).

## Travail à réaliser

1. Dans chaque route listée, remplacer le `<div className="p-6">` racine par
   `<PageContainer>`. Conserver toute la logique (requêtes, états, gardes de rôle)
   intacte.

2. Remplacer les grilles de cartes :
   - `minmax(16rem,1fr)` → `cardGrid.compact`
   - `minmax(18rem,1fr)` → `cardGrid.default`
   - `minmax(20rem,1fr)` → `cardGrid.default`
   - Laisser les grilles déjà sûres du dashboard
     (`minmax(min(20rem,100%),1fr)`) telles quelles, ou les aligner sur
     `cardGrid` si cela ne change pas le rendu bureau.

3. Corriger les grilles de détail figées en `grid-cols-2` (paires clé/valeur,
   ex. `chantiers` detail) en `grid-cols-1 sm:grid-cols-2`, et confirmer que les
   détails déjà en `md:grid-cols-2/3` (ex. `equipements`) restent inchangés.

4. Vérifier que chaque page reste correcte avec `min-w-0` sur les conteneurs de
   texte tronqué (éviter les débordements en grille).

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Plus aucun `<div className="p-6">` racine dans les pages listées
  (`PageContainer` partout).
- Sur mobile (375px), chaque liste affiche une colonne lisible ; sur tablette
  (768px) deux ; sur bureau (>=1024px) trois ou quatre selon la densité.
- Aucune logique métier modifiée (diff limité aux conteneurs et classes).
