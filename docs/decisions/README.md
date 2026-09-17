# Décisions d'architecture (ADR)

Ce dossier garde la trace des **choix techniques** du front Dédale, au fil du dev.
Un fichier = une décision. Numérotation croissante : `NNNN-titre-court.md`.

Objectif : ne jamais avoir à re-justifier un choix déjà tranché, et comprendre plus tard
_pourquoi_ le code est ainsi. Les conventions vivantes (à appliquer en continu) restent
dans `CLAUDE.md` à la racine ; ici on consigne les **décisions ponctuelles** et leur contexte.

## Format d'une décision

```md
# NNNN — Titre

- **Date** : AAAA-MM-JJ
- **Statut** : accepté | remplacé par [NNNN] | abandonné

## Contexte

Le problème ou la question.

## Décision

Ce qui a été choisi.

## Conséquences

Ce que ça implique (avantages, limites, ce qu'on s'interdit).
```

## Index

- [0001 — Fondations du front](0001-fondations-front.md)
- [0002 — Conventions de stack & outillage qualité](0002-conventions-et-outillage.md)
- [0003 — Design system & conventions modulaires](0003-design-system-et-conventions-modulaires.md)
- [0004 — Front métier livré (19 étapes)](0004-front-metier-livre.md)
- [0005 — Graphiques du tableau de bord en SVG maison](0005-charts-svg-maison.md)
- [0006 — Briques partagées : adoption mesurée, mesures dans la brique](0006-briques-et-adoption.md)
- [0007 — Création de comptes sans e-mail](0007-comptes-sans-email.md)
- [0008 — Tâche généralisée (checklist) pour Travaux / Événements](0008-taches-generalisees.md)
- [0009 — Le catalogue commun est une réserve, pas une source vive](0009-catalogue-commun-reserve.md)
- [0010 — `source_id` n'est pas une clé de corrélation stable](0010-source-id-cle-de-correlation.md)
- [0011 — Le miroir front des droits se confronte à la RLS](0011-miroir-front-des-droits-confronte-a-la-rls.md)
- [0012 — Corréler les exécutions en deux temps : `source_id`, puis le nom](0012-correlation-des-executions-en-deux-temps.md)
