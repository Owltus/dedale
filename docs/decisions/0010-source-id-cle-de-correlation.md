# 0010 — `source_id` n'est pas une clé de corrélation stable

- **Date** : 2026-09-16
- **Statut** : accepté (constat). Les trois options de traitement qu'il posait ont été
  mesurées puis arbitrées par [0012](0012-correlation-des-executions-en-deux-temps.md) —
  corrélation en deux temps, `source_id` puis repli sur le nom.

## Contexte

Chaque ligne d'`operations_execution` est un **instantané** : l'opération de
gamme y est recopiée (nom, seuils, unité) au moment où l'OT est généré, si bien
que l'historique d'un OT clôturé reste lisible même si la gamme change ensuite.
La ligne garde en plus un couple `(source_type, source_id)` qui désigne
l'opération d'origine.

Deux logiques se sont installées en parallèle, et elles se contredisent.

**La base traite `source_id` comme une simple provenance.** Le trigger
`validation_suppression_operation_specifique` bloque la suppression d'une
opération quand sa gamme porte encore des OT actifs, mais **pas** quand des
exécutions la référencent — le commentaire du fichier de schéma le dit en toutes
lettres : « on autorise DELETE même si des ops_exec existent (snapshot
indépendant) ». Il n'y a d'ailleurs aucune clé étrangère sur `source_id`. C'est
une décision explicite, et cohérente avec le principe de l'instantané.

**Le front, lui, s'en sert comme d'une clé métier.** `previousReadings`
(`features/ordres-travail/queries.ts`) relie « la même opération récurrente »
d'un OT à l'autre par `(source_type, source_id)`, et `releves.ts` construit la
clé de série d'un graphique de la même façon. Un compteur d'eau n'a de sens que
comme suite de relevés ; cette suite est donc chaînée par une valeur que la base
autorise à pointer dans le vide.

Ce n'est pas théorique. La migration 063 avait déjà dû **reconstruire à la
main** des `source_id` rendus aléatoires par l'import 061, en recorrélant par
`(gamme, nom)` — elle a donc démontré, sur les données réelles, qu'une clé
métier stable est calculable. Lecture de la production le 16/09/2026 :
**57 exécutions sur 2 452** pointent une opération supprimée. Aucune ne porte
aujourd'hui de `valeur_mesuree` : la perte est pour l'instant une perte de
**chaînage**, pas encore une perte de mesure — mais rien n'empêche la prochaine
suppression de couper une série de relevés en deux.

L'écran, lui, n'en dit rien. Il affiche un historique vide, exactement comme
pour une opération relevée pour la première fois.

## Décision

**Le constat est acté : `source_id` est une provenance, pas une clé de
corrélation.** Tout code qui s'en sert pour recoller deux exécutions entre elles
doit traiter l'absence de correspondance comme un cas **normal et affichable**,
jamais comme une donnée manquante silencieuse.

Le traitement de fond n'est pas tranché ici. Trois options sont posées, avec ce
qu'elles coûtent :

1. **Rendre la suppression conditionnelle** — bloquer le DELETE d'une opération
   dès qu'une exécution la référence. Simple, mais cela **revient sur une
   décision explicite** du modèle : l'instantané avait justement été conçu pour
   que la gamme reste modifiable sans figer l'historique. Effet de bord : une
   gamme vivante deviendrait de moins en moins éditable avec le temps.
2. **Matérialiser une clé métier stable** `(gamme_id, nom normalisé)`, figée sur
   la ligne d'exécution **à la génération de l'OT**. C'est ce que la migration
   063 a fait à la main, donc la faisabilité est démontrée. La corrélation
   survivrait alors à la suppression comme au renommage de l'opération. Coût :
   une colonne, une migration de rattrapage, et le choix d'une normalisation de
   nom qu'il faudra ensuite ne plus changer.
3. **Accepter la perte et le dire dans l'interface.** Aucune migration : la
   fiche d'OT et les graphiques de relevés distinguent « première mesure » de
   « historique rompu — l'opération d'origine a été supprimée ». Le moins cher,
   et le plus honnête envers l'utilisateur ; mais la donnée reste perdue.

## Conséquences

- **En attendant l'arbitrage, l'option 3 est le minimum exigible** : un
  historique introuvable ne doit plus s'afficher comme un vide indifférencié.
  Un écran qui corrèle par `source_id` doit prévoir ce cas.
- Aucune requête ne doit supposer que `source_id` résout. `releves.ts` traite
  déjà `source_id: null`, et son test le documente — c'est le comportement de
  référence.
- Le contrôle `tests/securite/coherence-donnees.sql` compte ces orphelins. Leur
  nombre est un invariant **volontairement laissé ouvert** tant que cette
  décision n'est pas tranchée : il doit être suivi, pas remis à zéro en douce.
- Ce que cette décision ne couvre pas : les exécutions dont `source_type` vaut 2
  (opérations issues d'un modèle), soumises au même raisonnement mais sans cas
  observé en production à ce jour.
