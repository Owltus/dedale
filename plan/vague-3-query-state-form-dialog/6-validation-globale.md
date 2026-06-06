# Étape 6 — Validation & revue

## Objectif

Valider l'ensemble de la vague 3 (aucune régression) et auditer le diff.

## Fichier(s) impacté(s)

- Aucun en principe (recette). Corrections ponctuelles si besoin.

## Travail à réaliser

1. Chaîne complète : `npm run format`, `npx tsc -b`, `npx eslint .`,
   `npx vite build` — tout vert.
2. Recherches de non-régression :
   - les écrans migrés n'ont plus le bloc 4 états recopié (plus de
     `Array.from({ length: … }).map` de squelettes inline sur ces écrans) ;
   - les dialogs migrés n'ont plus de coquille `Dialog`+`DialogFooter` recopiée
     (seulement `FormDialog` + champs).
3. Revue manuelle ciblée : ouvrir 3-4 écrans liste (états pending/erreur/vide/
   données + recherche), et 3-4 dialogs (validation Zod, requis, cascade DI,
   conditionnel observation, upload document, reset à la réouverture, toasts).
4. Audit du diff via `/code-review` (en remplacement de `/borg`) : régressions de
   comportement, narrowing TS de QueryState, état/reset des dialogs, classes en
   dur.
5. Commits par étape (1 à 5) ; sinon commit récapitulatif.

## Critère de validation

- `npm run format`, `npx tsc -b`, `npx eslint .`, `npx vite build` verts.
- Non-régression vérifiée (états listes, dialogs, toasts, reset).
- `/code-review` sans régression bloquante.
