# Étape 6 — Compatibilité legacy et validation globale

## Objectif

Garantir que les données existantes (specs plates non typées) restent lisibles et éditables, et valider l'ensemble du chantier de bout en bout.

## Contexte

Des modèles et équipements existent déjà avec `specifications = { "Marque": "...", "Poids": "25" }` (objet plat, tout texte). La feature ne doit pas les casser ni exiger de migration SQL.

## Fichier(s) impacté(s)

- `src/lib/champs.ts` (modifié — robustesse de `parseChamps` sur le legacy)
- Vérification transverse de tous les fichiers des étapes 1 à 5.

## Travail à réaliser

### 1. Robustesse `parseChamps`

- Entrée `{ champs: [...] }` → renvoyée telle quelle (après validation Zod tolérante).
- Entrée objet plat `{ cle: valeur }` → mappée en champs `{ cle, type: 'texte', requis: false, defaut: null, valeur: String(valeur) }`.
- Entrée vide / null / forme inconnue → `[]` (jamais d'exception).

### 2. Garde-fou taille

Vérifier qu'un modèle avec beaucoup de champs reste sous le CHECK 10 ko (sérialisé). Si risque réel, alerter dans le form (compteur) — pas de changement SQL.

### 3. Validation globale

- `npm run typecheck` · `npm run lint` · `npm run test` · `npm run build` tous verts.
- Parcours manuel : créer un modèle typé → instancier un équipement → saisir les valeurs → lire le détail formaté. Plus : ouvrir un ancien modèle/équipement « plat » et vérifier l'absence de plantage.

## Critère de validation

- Aucune donnée existante cassée (legacy lu en texte, éditable).
- Toute la chaîne (modèle → équipement → lecture) fonctionne pour les 5 types.
- Pipeline `typecheck + lint + test + build` vert.

## Contrôle (audit manuel — étape critique)

- Vérifier qu'aucune écriture ne produit un `specifications` non conforme au CHECK (objet, < 10 ko, pas de clé `__proto__`/`constructor`/`prototype` — donc interdire ces noms de champ côté `cle`).
- Vérifier que `instancier_equipement` (inchangée) copie bien la nouvelle structure sans transformation.
- Confirmer qu'aucun fichier `schema_complete.sql` / migration n'a été touché (chantier 0 SQL).
