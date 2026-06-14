# Étape 4 — Nettoyage & cohérence

## Objectif

Finaliser le cloisonnement : **supprimer l'onglet générique « Domaines & familles »**,
contraindre les catégories d'équipement à **un seul niveau**, unifier la **terminologie**
(catégorie / sous-catégorie), et rendre la **suppression d'un modèle d'opération lié
non-bloquante** (détacher proprement plutôt que mur `RESTRICT`).

## Contexte (acquis)

- L'onglet « Domaines & familles » (`categories-panel.tsx`) affiche **toutes** les catégories
  (tous scopes, tous périmètres) → c'est la source du mélange. Les catégories d'équipement sont
  désormais gérées dans l'onglet Équipement (drill-down), celles de gamme dans l'onglet Gammes.
- Reste du vocabulaire « domaine/famille » : label d'onglet, `category-tree.tsx` (commentaire,
  option racine), `category-form-dialog.tsx` (description, « domaine racine »).
- Suppression d'un `modele_operation` lié = **RESTRICT** en base (échec `23503`). On veut une
  UX logique côté front.

## Fichier(s) impacté(s)

- `src/routes/_app/bibliotheque.tsx` — retirer l'onglet `categories` (« Domaines & familles ») et son import.
- `src/features/categories/components/categories-panel.tsx` — supprimer (ou réduire à l'usage interne réutilisé par les onglets Équipement/Gammes).
- `src/features/categories/components/category-form-dialog.tsx` + `category-tree.tsx` — terminologie « catégorie / sous-catégorie » ; description selon le scope (équipement : 1 niveau).
- `src/features/modeles-equipements/components/modeles-equipements-panel.tsx` — **interdire la création de sous-catégorie** (équipement = 1 niveau) : pas de bouton « ajouter une sous-catégorie », parent toujours racine.
- `src/features/modeles-operations/components/gammes-types-panel.tsx` + form — suppression non-bloquante (cf. ci-dessous).

## Travail à réaliser

### 1. Supprimer l'onglet générique

Retirer `categories` des `tabs` de `bibliotheque.tsx`. Conserver les composants `categories/`
réutilisés (arbre, form) mais plus d'onglet dédié « tout mélangé ».

### 2. Équipement = 1 niveau

Dans le drill-down équipement : la création de catégorie est toujours **racine** (pas de
`parent_id`), pas d'action « sous-catégorie ». Vérifier que la lecture n'affiche pas de
hiérarchie pour le scope équipement.

### 3. Terminologie

Remplacer « domaine/famille » par « catégorie / sous-catégorie » dans `category-tree`,
`category-form-dialog` (description adaptée : équipement « une catégorie » ; gamme « catégorie
ou sous-catégorie »). Le champ scope reste interne (déjà piloté par `preset`).

### 4. Suppression non-bloquante d'un modèle d'opération

Avant de supprimer un `modele_operation`, **détecter ses liens** `gamme_modeles`. Si lié :
afficher les gammes concernées + proposer « Détacher de toutes les gammes puis supprimer »
(DELETE des lignes `gamme_modeles` puis DELETE du modèle), au lieu de laisser remonter l'erreur
`23503`. Vérifier la RLS du détachement (Angle A2).

## Ordre d'exécution

1. Suppression onglet générique. 2. Équipement 1 niveau. 3. Terminologie. 4. Suppression
   non-bloquante. 5. Trancher A3 (catégories `mixte`).

## Critère de validation

- La Biblio n'a plus d'onglet « Domaines & familles » ; aucune régression dans Équipement/Gammes.
- Impossible de créer une sous-catégorie d'équipement ; possible pour les gammes.
- Plus aucun « domaine/famille » à l'écran.
- Supprimer un modèle d'opération lié propose le détachement et aboutit sans erreur brute.
- `typecheck` · `lint` · `build` verts.

## Contrôle (étape critique — suppression d'un panneau + logique de suppression)

- Vérifier qu'**aucun composant** n'importe encore l'onglet retiré (pas de build cassé).
- Confirmer que la suppression non-bloquante **ne supprime jamais** une gamme (juste les liens),
  et que le modèle disparaît bien après détachement.
- Trancher A3 : décider du sort des catégories `mixte` (afficher des deux côtés, ou ne plus en
  proposer à la création) et le documenter.
