# Étape 4 — Lecture typée des caractéristiques

## Objectif

Afficher les caractéristiques formatées selon leur type (date localisée, nombre + unité, Oui/Non…) là où on les lit, au lieu de la chaîne brute actuelle.

## Contexte

Aujourd'hui le détail d'équipement affiche les specs en `<dl>` clé/valeur brut (`formatSpecValue` retourne du texte). On remplace par `formatChampValeur` (étape 2). S'applique aussi à tout aperçu des caractéristiques d'un modèle, le cas échéant.

## Fichier(s) impacté(s)

- `src/routes/_app/equipements.tsx` (modifié — `readSpecifications` / `formatSpecValue` → champs typés)
- (le cas échéant) un éventuel aperçu des caractéristiques côté modèle

## Travail à réaliser

### 1. Lire les champs

Remplacer `readSpecifications()` (qui sort des paires clé/valeur) par `parseChamps(specifications)` → `ChampDefinition[]` (chaque champ porte son type et sa `valeur`).

### 2. Formater par type

Dans la grille de détail, pour chaque champ : afficher `champ.cle` + `formatChampValeur(champ, champ.valeur)`. Une valeur absente → `—`. Conserver la grille responsive existante (`md:grid-cols-2`).

### 3. Compat

Si `parseChamps` reçoit un ancien objet plat (équipement créé avant la feature), il renvoie des champs `texte` → l'affichage reste correct (chaîne brute), sans plantage.

## Ordre d'exécution

1. Brancher `parseChamps` à la lecture.
2. Remplacer le formatage par `formatChampValeur`.

## Critère de validation

- Un équipement avec champs typés affiche : date localisée, nombre + unité, Oui/Non, valeur de liste.
- Un équipement « legacy » (specs plates) s'affiche toujours sans erreur.
- `npm run typecheck` + `npm run build` verts.
