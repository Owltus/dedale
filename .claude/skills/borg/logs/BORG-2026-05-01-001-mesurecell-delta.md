# BORG-2026-05-01-001 — MesureCell.tsx : logique d'affichage du Δ

> Projet : DÉDALE (GMAO Tauri+React+TS+SQLite)
> Drones déployés : Trois-de-Cinq (Cartographe), Quatre-de-Cinq (Failles), Six-de-Neuf (Contradicteur)
> Mode : DIAGNOSTIC

## Cible

Audit de la logique d'affichage de la consommation Δ dans `src/pages/ordres-travail/MesureCell.tsx`. Plainte utilisateur : « je vois des ordres de travail avec consommation affichée alors qu'il n'y a pas de raison ».

## Cartographie (Trois-de-Cinq)

Flux : `get_operations_historique` (SQL DESC) → `useOperationsHistorique` (Map) → `[id].tsx` → `OtOperationsTable` → `MesureCell.findPreviousReleve(history, op.date_execution)`.

Conditions d'affichage du Δ (ordre) :
1. `isMesureOp(op)` (présence seuil ou unité)
2. `isCounter` via `isCounterUnit(seriesValues, symbole)` (monotonie ≥ 85% ou symbole connu)
3. `op.valeur_mesuree !== null`
4. `previous?.valeur_mesuree != null`
5. Si Δ < 0 → "⟳ nouveau compteur", sinon `formatDelta(delta)`

Hypothèses implicites :
- SQL trie DESC sur `COALESCE(date_execution, date_prevue)`
- Exclusion OT courant via `id_ordre_travail != ?3`
- `op.date_execution` est conceptuellement la date du relevé courant
- Comparaison string ISO YYYY-MM-DD pour ordre temporel (correct lexicographiquement)

## Failles (Quatre-de-Cinq)

Bug 1 (HAUTE) : sur OT réouvert ou OT futur où l'utilisateur saisit une valeur, `handleMesureChange` (OtOperationsTable.tsx:146) auto-remplit `date_execution = todayIso()`. `findPreviousReleve` cherche alors un précédent < aujourd'hui sans tenir compte de la position chronologique réelle de l'OT.

Bug 2 (MOYENNE) : historique pas rechargé après mutation — possible si invalidate manque.

## Contradiction (Six-de-Neuf)

Bug 1 : **VALIDÉ partiellement**. Pas de cas observable actuellement (aucun OT en statut 5 Réouvert), mais le mécanisme est confirmé sur le code (OtOperationsTable.tsx:146 → todayIso() pour les OT planifiés). Le cas se reproduit aussi sur tout OT planifié dans le futur dont la valeur est saisie en avance.

Bug 2 : **RÉFUTÉ**. `invalidateOtAndReleves` (use-ordres-travail.ts:16-18) invalide bien `historique` après mutation.

Bug X (HAUTE) découvert par le Contradicteur : opérations avec date_execution = NULL et valeur backdatée par l'utilisateur → comparaison contre précédent absolu erroné. Ex : OT 809, opération 2881.

## Verdict unifié

**Bug racine** : `MesureCell` utilise `op.date_execution` comme référence pour trouver le précédent chronologique. Cette donnée est modifiable par l'utilisateur (saisie brouillon, default = aujourd'hui via `OtOperationsTable.tsx:146`), donc instable et incohérente avec la position réelle de l'OT dans la séquence chronologique.

**Cause profonde** : `MesureCell` n'a pas accès à la **date conceptuelle de l'OT** (`ot.date_prevue` qui est stable, représente le mois cible de l'OT). Il devrait l'utiliser au lieu de `op.date_execution`.

**Cas problématiques observables** :
- OT planifiés dans le futur avec saisie en avance → comparaison contre précédent "absolu" plutôt que contre OT N-1 chronologique
- OT réouverts (statut 5, théorique en l'état actuel de la base)
- OT backdatés (date_execution saisie manuellement à une date antérieure)

## Directive

1. **Fix obligatoire** : passer `ot.date_prevue` à `MesureCell` via une nouvelle prop, et que `findPreviousReleve` l'utilise comme référence (au lieu de `op.date_execution`). La date_prevue de l'OT est invariante et représente correctement la position chronologique de l'OT dans sa gamme.

2. **Robustesse** : éventuellement, basculer le hook `useOperationsHistorique` pour qu'il filtre côté backend les relevés strictement antérieurs à `ot.date_prevue` du OT courant — plus économe et plus sûr.

## Actions exécutées

Diagnostic uniquement.
