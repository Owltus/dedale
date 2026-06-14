# Étape 3 — Définition des champs sur le modèle

## Objectif

Remplacer l'éditeur clé/valeur du formulaire de modèle par un **éditeur de définitions de champs typés** : pour chaque champ, un nom, un type, une unité (si nombre), des options (si liste), une valeur par défaut (via `ChampValeurInput`) et un toggle « requis ». Persister au bon format JSONB.

## Contexte

C'est le cœur côté Bibliothèque (point d'arrêt naturel A2 : on peut livrer jusqu'ici sans toucher aux équipements). Le form modèle a été récemment retravaillé (lockedScope, lockedCategorieId, minimal) ; attention à ne pas casser ces modes.

## Fichier(s) impacté(s)

- `src/features/modeles-equipements/components/specifications-editor.tsx` (modifié — devient l'éditeur typé)
- `src/features/modeles-equipements/components/modele-equipement-form-dialog.tsx` (modifié — `specsToLines` / `initialValues`)
- `src/features/modeles-equipements/mutations.ts` (modifié — `modelePayload`)

## Travail à réaliser

### 1. Éditeur typé (`specifications-editor.tsx`)

Une ligne par champ avec : nom (`TextField`), type (`SelectField` peuplé par `CHAMP_TYPES`), unité (visible si `type = nombre`), options (liste dynamique d'inputs jointe par `|`, visible si `type = liste`), valeur par défaut (`ChampValeurInput` piloté par le champ), toggle requis, bouton supprimer. Bouton « Ajouter un champ ».

Validation fine au submit : noms de champs **non vides et uniques** ; si `type = liste`, au moins une option.

### 2. Form modèle (`modele-equipement-form-dialog.tsx`)

- `initialValues` / `specsToLines` : lire `specifications` via `parseChamps` (gère le legacy plat) → `ChampDefinition[]`.
- En mode `minimal` (création depuis la navigation), l'éditeur de champs reste masqué (champs ajoutés à l'édition) — cohérent avec la décision « création = Nom + Description ».
- À l'édition, l'éditeur de champs est visible.

### 3. Mutation (`mutations.ts`)

`modelePayload` : `specifications: serializeChamps(values.specifications)` (objet `{ champs: [...] }`), au lieu du `Record<string,string>` actuel. Sur le modèle, `valeur` est absent (seul `defaut` est rempli).

## Ordre d'exécution

1. Éditeur typé.
2. Câblage form (parse + visibilité selon `minimal`/édition).
3. Mutation (serialize).

## Critère de validation

- Créer/éditer un modèle, définir un champ de chaque type, recharger : les définitions persistent au format `{ champs: [...] }`.
- Le mode `minimal` (création rapide) ne montre pas l'éditeur de champs.
- `npm run typecheck` + `npm run lint` + `npm run build` verts.
