# 0018 — Déployer une flotte d'équipements en une transaction, annulable par lot

- **Date** : 2026-11-25
- **Statut** : accepté (décisions du PO du 25/11/2026). Mise en œuvre :
  - 184 : `deployer_equipements`, `annuler_deploiement`, colonne
    `equipements.lot_deploiement`, synchro des gammes en fin de lot,
    `instancier_equipement` supprimée ;
  - application : assistant `DeploiementDialog` (sous-catégorie de parc,
    fiche d'un lieu), annulation depuis la notification et la liste des
    déploiements de la flotte ;
  - 186 : gestes du connecteur Claude (`claude_creer_modele_equipement`,
    `claude_deployer_equipements`, `claude_annuler_deploiement`, ADR 0015).
- **Plan** : `plan/fiche-lieu-et-deploiement-equipements/` (local), étapes 4,
  5 et 7.

## Contexte

Poser « ce détecteur dans les 200 chambres » se faisait équipement par
équipement, ou par l'import CSV, qui enchaîne des insertions indépendantes
(une partie peut réussir, l'autre échouer) sans rattacher les plans de
maintenance. Rattacher ensuite 200 équipements à une gamme répétée par
équipement (ADR 0013) relançait 200 fois la synchronisation complète de ses
OT ouverts : le déclencheur de `gammes_equipements` est par ligne. Un
déploiement raté ne se défaisait qu'à la main. Enfin `instancier_equipement`
(013c) n'était appelée nulle part et ne suivait plus le modèle actuel.

## Décision

1. **On déploie une flotte**, c'est-à-dire une sous-catégorie de parc, liée
   à son modèle de la Bibliothèque ou dotée de son propre gabarit. Le modèle
   seul ne suffit pas : c'est la flotte qui range les équipements et porte la
   valeur principale. Aucune notion nouvelle.
2. **Une transaction, un site, 500 lieux au plus.** Un équipement par lieu,
   au format exact du front (gabarit, valeurs par défaut, valeurs communes) ;
   une valeur principale de type texte prend le nom du lieu (« Détecteur
   Chambre 214 »). Un lieu qui a déjà un équipement de la flotte est un
   doublon, ignoré par défaut.
3. **Plans de maintenance choisis à chaque déploiement**, du site seulement
   (jamais du commun, ADR 0009). Pas de lien permanent « flotte → gammes ».
4. **Synchro unique en fin de lot** : pendant un déploiement (indicateur de
   transaction `dedale.deploiement_en_cours`), le déclencheur par ligne se tait
   et un déclencheur par instruction synchronise une fois chaque gamme
   touchée. Hors lot, rien ne change.
5. **Aperçu d'abord** : le déploiement est joué puis annulé, et l'écran montre
   ce que la base a calculé (répartition par bâtiment et niveau, doublons,
   exemples, opérations ajoutées aux OT ouverts) avant tout enregistrement.
6. **Numéro de lot** (`equipements.lot_deploiement`), posé par le seul
   déploiement. Il hérite de la RLS des équipements, sans table ni policy
   nouvelles.
7. **Annulation d'un lot** : supprime les équipements du lot qui n'ont aucun
   historique (opérations saisies ou OT terminé, documents, DI, travaux,
   événements, observations) après les avoir détachés de leurs gammes (synchro
   unique) ; garde et liste les autres avec leurs raisons. Elle reste possible
   à tout moment.
8. **Droits** : admin, manager et technicien sur leurs sites, comme la
   création d'un équipement à l'unité ; les fonctions sont SECURITY INVOKER.
9. **Connecteur Claude** (186) : trois gestes à aperçu et code (ADR 0015).
   Claude crée un modèle du site (et sa flotte), déploie une flotte en
   désignant les lieux par bâtiment, niveau et type (résolus par la base, sans
   ambiguïté) ou par les lieux de l'outil `lieux`, et annule le N-ième
   déploiement le plus récent d'une flotte. Le code d'un déploiement est lié à
   la liste triée des lieux et à l'état de la flotte. C'est la seule
   suppression d'équipements ouverte à Claude.

## Conséquences

- Tout ajout d'équipements en nombre passe par `deployer_equipements` ; l'import
  CSV reste pour les données hétérogènes (une ligne = un équipement différent).
- Le déploiement suit la Bibliothèque du site : un modèle du commun s'installe
  d'abord sur le site (ADR 0009).
- Un lot n'a ni nom ni date propres : tout se déduit de ses équipements (site,
  flotte, date de création, nombre). Remettre `lot_deploiement` à NULL sort un
  équipement de son lot.
- Supprimer un équipement hors annulation d'un lot se fait dans
  l'application, à l'unité. Claude ne supprime jamais de modèle ni de flotte.
