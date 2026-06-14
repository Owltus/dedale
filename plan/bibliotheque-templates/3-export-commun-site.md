# Étape 3 — Export commun → site (copie fine)

## Objectif

Donner aux techniciens la **vraie** copie « bibliothèque → mon site » : depuis un template
commun, **copier vers un site** une gamme seule, un modèle d'équipement, ou une **catégorie
entière + son contenu**. La copie est **découplée** (snapshot) : le tech modifie ensuite sa
copie librement, l'original commun reste intact.

## Contexte (acquis)

- `copier_gamme(source, site_cible)` : EXISTE, copie par valeur (gamme + `operations` +
  lignes `gamme_modeles`, modèles partagés). Aujourd'hui le front l'utilise **uniquement en
  copie intra-site** (`siteCible = site courant`) — le cas commun→site n'est pas offert.
- `copier_modele_equipement(source, site_cible)` : EXISTE mais **jamais appelée** côté front.
- Droits : copie vers un site = admin, ou manager/technicien avec `has_site_access` sur la cible.

## Fichier(s) impacté(s)

- `src/features/gammes/mutations.ts` — généraliser `useCopierGamme` (site cible **choisi**, pas forcément le courant).
- **NOUVEAU** `src/features/modeles-equipements/mutations.ts` — `useCopierModeleEquipement` (RPC `copier_modele_equipement`).
- **NOUVEAU** `src/components/common/exporter-vers-site-dialog.tsx` — dialog réutilisable : choix du site cible (parmi `get_my_sites`) + confirmation.
- `gammes-biblio-panel.tsx` (étape 1) + `modeles-equipements-panel.tsx` — bouton **« Copier vers un site »** sur une gamme-template / un modèle / une catégorie.
- _(Angle A1)_ copie « catégorie + contenu » : boucle front (copier chaque gamme de la catégorie) **ou** RPC `copier_categorie_contenu` (décision en début d'étape).

## Travail à réaliser

### 1. Trancher A1 (granularité catégorie)

Choisir : **boucle front** (lister les gammes de la catégorie, appeler `copier_gamme` pour
chacune vers le site cible) — simple, zéro SQL — **ou** nouvelle RPC atomique. Recommandation :
boucle front pour la V1 (les catégories communes étant partagées, pas besoin de les dupliquer).

### 2. Dialog « Exporter vers mon site »

Composant commun : sélection du site cible (`get_my_sites`, exclut le commun), résumé de ce qui
sera copié, bouton Confirmer. Appelle la bonne RPC selon le type (gamme / modèle d'équipement)
ou boucle sur le contenu d'une catégorie.

### 3. Points d'entrée

- Sur une **gamme-template** : « Copier vers mon site ».
- Sur un **modèle d'équipement** : idem (`copier_modele_equipement`).
- Sur une **catégorie** (gamme) : « Copier la catégorie + son contenu vers mon site » (boucle).

### 4. Retour utilisateur

Toast de succès + invalidation des queries du site cible. Gérer les copies partielles d'une
catégorie (X/Y copiées) sans bloquer.

## Ordre d'exécution

1. Décision A1. 2. Mutations copie (gamme cible choisie + modèle d'équipement). 3. Dialog commun.
2. Boutons sur gammes / modèles / catégories. 5. Boucle catégorie.

## Critère de validation

- En technicien : depuis une gamme-template commune, « Copier vers mon site » → la gamme
  apparaît sur le site, modifiable, indépendante de l'original.
- Copier une catégorie entière → toutes ses gammes atterrissent sur le site.
- Copier un modèle d'équipement commun → présent sur le site.
- `typecheck` · `lint` · `build` verts.

## Contrôle (étape critique — RPC + boucle multi-écriture)

- Confirmer le **découplage** : modifier la copie de site ne touche pas l'original commun.
- Vérifier les **droits** : un technicien ne peut copier que vers **ses** sites (sinon erreur
  remontée proprement, pas de mur brut).
- Boucle catégorie : une erreur sur une gamme ne doit pas annuler les autres (log du partiel).
