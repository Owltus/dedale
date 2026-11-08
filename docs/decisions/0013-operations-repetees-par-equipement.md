# 0013 — Répéter les opérations d'une gamme pour chaque équipement lié

- **Date** : 2026-11-08
- **Statut** : accepté (décisions du PO du 07/11/2026). Mise en œuvre : migration 128,
  plan `plan/operations-par-equipement/`.
- **Amende** : [0012](0012-correlation-des-executions-en-deux-temps.md) (la
  provenance intègre l'équipement).

## Contexte

Les six gammes « Entretien clim R+1 » à « R+6 » contenaient **166 opérations
écrites à la main**, deux par chambre (« Nettoyage filtre Clim 302 »…). Ces
opérations n'étaient reliées ni à la chambre ni à l'appareil réels. Une IA y a
ajouté une chambre qui n'existe pas, et rien ne l'a signalé. Aucun historique
par appareil n'était possible : il n'y avait aucune clim dans le parc.

Le lien `gammes_equipements` existait, mais il ne servait qu'à l'affichage :
`generate_operations_execution` produisait **une** ligne par opération de la
gamme.

## Décision

1. **`gammes.repeter_par_equipement`** est une option, à `false` par défaut.
   Quand elle est active, chaque OT reçoit les opérations de la gamme (sources
   1 et 2) **une fois par équipement lié**.
2. **Repli** : si l'option est active mais qu'aucun équipement n'est lié, les
   opérations sont générées une seule fois, comme avant. Un OT ne naît jamais
   vide, puisque sa clôture serait ensuite refusée.
   `equipements_attendus(gamme)` est la **source unique** de cet ensemble :
   la génération et la synchro s'en servent toutes les deux.
3. **`operations_execution.equipement_id` est une provenance, sans clé
   étrangère**, comme `source_id` ([0010](0010-source-id-cle-de-correlation.md)).
   Il s'accompagne de deux libellés figés : `nom_equipement` (type + valeur
   principale, « Climatiseur 302 ») et `nom_localisation` (chemin court).
   Une clé étrangère en `SET NULL` est écartée : le `SET NULL` est un UPDATE,
   que les protections des OT clôturés (`protection_operations_ot_terminaux`,
   `protect_opex_snapshots`) refusent. Supprimer un équipement deviendrait donc
   impossible. Les libellés figés suffisent à l'historique.
4. **La synchro des OT ouverts** (124) raisonne sur
   `(source_type, source_id, equipement_id)`. Lier ou délier un équipement,
   le modifier, renommer sa catégorie ou basculer l'option resynchronise les OT
   ouverts de la gamme.
5. **Une ligne saisie n'est jamais touchée.** Le critère « non saisie » est
   durci : en attente **et** sans date, valeur, commentaire ni index de
   remplacement. Avant la 128, un commentaire posé sur une ligne en attente
   était effacé.
6. **Après un retrait, la synchro réévalue la clôture automatique.** Si tout ce
   qui reste est terminal, l'OT est clôturé (ou annulé). `gestion_statut_ot` ne
   réagit qu'à un UPDATE de statut, pas à un DELETE : avant la 128, l'OT restait
   « en cours ».
7. **L'ordre des équipements dans l'OT** est l'ordre numérique de leur
   emplacement (« Chambre 302 » avant « Chambre 1010 »), et il est appliqué à
   l'affichage. `ordre` reste le rang de l'opération. Aucun rang n'est ajouté
   sur `gammes_equipements` : ce serait de la saisie en plus.

## Conséquences

- **Corrélation ([0012](0012-correlation-des-executions-en-deux-temps.md))** :
  la provenance devient `(source_type, source_id, equipement_id)` et le repli
  par nom devient `(gamme, nom normalisé, equipement_id)`. Une ligne **sans**
  équipement garde exactement la clé d'avant, ce qui ne coupe aucune série
  existante.
- **Séries de relevés** : une mesure répétée sur N équipements donne N séries.
  On ne fait jamais la moyenne de deux équipements.
- **Écran OT** : les lignes sont rangées sous un en-tête par équipement. La
  ligne d'opération elle-même ne change pas.
- **Les droits ne changent pas** : la policy UPDATE manager / technicien sur
  `operations_execution` ouvre toutes les colonnes, donc le gel des trois
  nouvelles colonnes passe par `protect_opex_snapshots`.
- **Ce qu'on s'interdit** : réécrire une ligne saisie lors d'une synchro. La
  seule exception est la **reprise unique** de la bascule des gammes clim
  (migration 129). Elle rattache les lignes déjà saisies à leur clim et à
  l'opération générique, **sans** toucher au statut, à la date, à la valeur ni
  à l'auteur. Elle est tracée dans `audit_log`.
