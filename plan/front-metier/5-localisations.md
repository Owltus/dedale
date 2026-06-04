# Étape 5 — Référentiel : Localisations

## Objectif

Naviguer et gérer la hiérarchie spatiale : **bâtiments → niveaux → locaux**, avec fiche local.

## Contexte

Backend : `batiments` (site_id) → `niveaux` (batiment_id) → `locaux` (niveau_id, type_local).
Vue `v_locaux_chemin` donne le chemin complet. Suppressions protégées en cascade (cf. doc-fonctionnelle/08).

## Fichier(s) impacté(s)

- `src/features/localisations/` (queries, mutations, schemas, components)
- `src/routes/_app/localisations/` (galerie bâtiments → niveaux → locaux → détail local)

## Travail à réaliser

1. Galeries en cascade (réutiliser le composant de l'étape 4) + **fil d'Ariane** (site › bâtiment › niveau › local).
2. CRUD à chaque niveau (Dialog + Zod), avec image optionnelle (Storage / image_path).
3. **Verrous de suppression** : empêcher si enfants présents (bâtiment→niveaux, niveau→locaux), message clair.
   Pour les locaux : confirmation listant les conséquences.
4. **Fiche local** : infos + onglets (Équipements du local, Documents). Les onglets Gammes/OT viendront référencer les étapes 8/9.

## Critère de validation

- On crée un bâtiment, un niveau, un local, on navigue dans la hiérarchie via le fil d'Ariane.
- Supprimer un bâtiment avec niveaux est refusé proprement.
