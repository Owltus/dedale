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
