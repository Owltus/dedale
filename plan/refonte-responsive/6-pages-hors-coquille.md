# Étape 6 — Pages hors coquille

## Objectif

Vérifier et finaliser les pages qui ne vivent pas dans la coquille `_app` ou qui
ont déjà une largeur contrainte : `login`, `definir-mot-de-passe` et `profil`.
Elles sont déjà partiellement responsive ; il s'agit surtout de confirmer et
d'harmoniser.

## Fichier(s) impacté(s)

- `src/routes/login.tsx` (vérifié)
- `src/routes/definir-mot-de-passe.tsx` (vérifié)
- `src/routes/_app/profil.tsx` (modifié si besoin — passer en `PageContainer`)

## Travail à réaliser

1. `login.tsx` et `definir-mot-de-passe.tsx` : déjà centrés avec `px-4` et
   `max-w-sm`. Confirmer le rendu mobile (champs pleine largeur, bouton
   accessible), harmoniser les paddings si nécessaire. Ne pas ajouter de
   `PageContainer` (ces pages sont hors coquille, centrées).

2. `profil.tsx` : remplacer le `<div className="p-6">` racine par
   `PageContainer`, en conservant le `mx-auto max-w-xl` interne. Vérifier que les
   cartes Identité et Sécurité, les champs e-mail/mot de passe et les encarts de
   confirmation s'affichent bien sur mobile.

3. Vérifier la barre supérieure mobile (étape 2) sur la page profil, accessible
   via le menu « Mon profil » du drawer.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- `login` et `definir-mot-de-passe` restent centrés et utilisables sur mobile.
- `profil` utilise `PageContainer` et reste lisible (carte centrée) sur les trois
  tailles d'écran.
