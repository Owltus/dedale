# Étape 6 — Référentiel : Équipements & modèles d'équipement

## Objectif

Gérer les équipements (rattachés à un local, avec caractéristiques techniques) et la bibliothèque
de **modèles d'équipement**.

## Angle à clarifier (cf. INDEX #3)

Ancien : `Domaine → Famille → Équipement`. Backend actuel : équipement dans un **local**, avec
`categorie_id` + `specifications` (JSONB) + `modeles_equipements` (bibliothèque, RPC
`instancier_equipement`, `copier_modele_equipement`). **Décider** comment matérialiser Domaine/Famille
(via catégories ?) avant de coder les écrans.

## Fichier(s) impacté(s)

- `src/features/equipements/` et `src/features/modeles-equipements/`
- `src/routes/_app/equipements/`

## Travail à réaliser

1. Liste/galerie des équipements (vue `v_equipements_complet` : chemin spatial + catégorie), 4 états.
2. Fiche équipement : infos + **caractéristiques techniques** (rendu dynamique depuis `specifications`/modèle) + onglets (Gammes, OT, Documents).
3. Création : depuis un **modèle** (`instancier_equipement`) ou directe ; emplacement = cascade bâtiment→niveau→local ; dates (mise en service, fin garantie) ; statut actif/inactif (inactifs estompés).
4. **Modèles d'équipement** : bibliothèque (catégories), champs typés. **Archivage de champs → V2** (cf. INDEX #6).
5. Verrou suppression : équipement avec gammes liées → refus.

## Critère de validation

- Créer un équipement depuis un modèle pré-remplit ses caractéristiques.
- La fiche affiche le chemin spatial et les caractéristiques ; suppression bloquée si gammes liées.
