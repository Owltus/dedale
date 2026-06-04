# Étape 8 — Maintenance : Gammes & opérations

## Objectif

Gérer les gammes (modèles de maintenance préventive/réglementaire), leurs opérations, les modèles
d'opérations réutilisables, et la liaison aux équipements.

## Contexte

Backend : `gammes` (`nature`: controle_reglementaire / maintenance, site_id), `operations`
(gamme_id, libelle, ordre, frequence en semaine ISO), `modeles_operations` (+ items),
`gammes_equipements` (liaison), RPC `copier_gamme`.

## Fichier(s) impacté(s)

- `src/features/gammes/` et `src/features/modeles-operations/`
- `src/routes/_app/gammes/`

## Travail à réaliser

1. Galerie/liste des gammes + fiche gamme : infos (nature, périodicité, prestataire par défaut) + onglets :
   - **Opérations** (édition ; si type mesure → unité + seuils min/max)
   - **Modèles d'opérations** (associer/dissocier)
   - **Équipements** (liaison via fenêtre filtrée)
   - **Documents**
2. Périodicité en **semaines ISO** (cf. doctrine). Flag réglementaire.
3. Action `copier_gamme` (duplication). Bouton « Créer un OT » (prépare l'étape 9).

## Critère de validation

- Créer une gamme, lui ajouter des opérations (dont une mesure avec seuils), lier des équipements.
- Dupliquer une gamme via `copier_gamme`.
