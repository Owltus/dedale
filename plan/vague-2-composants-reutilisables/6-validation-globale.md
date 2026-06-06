# Étape 6 — Validation & revue

## Objectif

Valider l'ensemble de la vague 2 (aucune régression de comportement) et auditer
le diff avant de figer.

## Fichier(s) impacté(s)

- Aucun fichier de code en principe (étape de recette). Corrections ponctuelles
  si un écran révèle un défaut.

## Travail à réaliser

1. Chaîne complète : `npm run format`, `npx tsc -b`, `npx eslint .`,
   `npx vite build` — tout vert.
2. Recherches de non-régression :
   - plus aucun `<select>` natif ni `<textarea>` natif (hors primitives `ui/`),
   - plus de constantes `SELECT_CLASS` / `selectClass(es)`,
   - plus d'expression `role === '...'` dispersée hors `lib/permissions.ts`.
3. Revue manuelle ciblée : ouvrir quelques dialogs (di-form, gamme, OT create,
   upload document), vérifier validations Zod (messages d'erreur, champs requis),
   le switch de site, les filtres registre, l'édition de statut d'opération, la
   garde « pas de site » sur 2-3 pages, et les droits sur un écran par famille.
4. Audit du diff via `/code-review` (en remplacement de `/borg`, non installé) :
   cibler régressions de comportement, classes en dur, droits modifiés par
   mégarde.
5. Commits par étape (1 à 5) déjà faits idéalement ; sinon commit récapitulatif.

## Critère de validation

- `npm run format`, `npx tsc -b`, `npx eslint .`, `npx vite build` verts.
- Les recherches de non-régression ne remontent plus rien.
- `/code-review` sans régression bloquante.
- Comportement identique à avant la vague 2 (rendus, validations, droits).
