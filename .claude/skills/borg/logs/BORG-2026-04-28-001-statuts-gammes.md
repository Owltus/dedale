# BORG-2026-04-28-001 — Calcul des statuts de gammes (cascade + proximité)

> Projet : DÉDALE — GMAO desktop, Tauri v2 + React + TypeScript + SQLite
> Drones déployés : Trois-de-Cinq (cartographe), Sept-de-Neuf (conformité), Quatre-de-Cinq (failles), Six-de-Neuf (contradicteur)
> Mode : EXÉCUTION
> Antécédent : audit de cohérence préalable produit par Explore agent dans la session courante (les 6 incohérences listées)

## Cible

Logique de calcul des statuts de gammes — fonction `getProximiteStatutId()` et `computeAggregateStatutId()` dans `src/lib/utils/statuts.ts`, ainsi que l'éventuelle modification du SQL backend pour `nb_ot_en_retard`.

## Rapports des drones (synthèse — voir conversation parente pour l'audit complet)

### Trois-de-Cinq — Cartographie

Le statut de gamme est calculé en deux temps :
1. **Backend Rust** (`src-tauri/src/commands/gammes.rs`, `dashboard.rs`, `equipements.rs`, `localisations.rs`, `helpers/ot_list.rs`, `recherche.rs`) : produit les compteurs `nb_ot_total`, `nb_ot_en_cours`, `nb_ot_en_retard`, `nb_ot_reouvert`, `prochaine_date` via SQL agrégé.
2. **Frontend TS** (`src/lib/utils/statuts.ts`) : applique `computeAggregateStatutId()` sur ces compteurs pour produire l'ID de statut (1–9), exposé via `STATUTS_GAMME`.

Consommateurs frontend (9 fichiers) : `GammeSunburst`, `GammeList`, `DomaineGammeList`, `FamilleGammeList`, `EquipementList`, `DomaineEquipList`, `FamilleEquipList`, `lib/utils/index.ts`.

Pattern SQL `id_statut_ot IN (1, 2, 5)` = "OT actif (non-terminal)" — répété **22 fois** dans le codebase, dont 8 dans le schéma initial (triggers) et 7 dans les commandes Rust. Convention sémantique stable.

### Sept-de-Neuf — Conformité

| Règle | Statut | Preuve |
|---|---|---|
| `getProximiteStatutId` filtre arbitraire `joursPeriodicite >= 30/60` | □ DÉVIATION | `statuts.ts:130-132`. Une gamme hebdomadaire avec OT dans 3 jours est classée "Validé". |
| Cascade `nbReouvert` testé avant `nbRetard` | □ DÉVIATION | `statuts.ts:150-151`. Une gamme avec OT réouvert + en retard masque le retard. |
| Aucune garde sur `prochaineDate` dans le passé | ◈ ANGLE MORT | `statuts.ts:119-134`. `diff` négatif possible, retourne null silencieusement. |
| `IN (1, 2, 5)` pour OT actif | ■ CONFORME | Cohérent sur 22 emplacements + triggers schéma. |

### Quatre-de-Cinq — Failles

- **HAUTE — Filtre périodicité** : Gammes courte-périodicité systématiquement sous-estimées en visibilité (statut "Validé" même 3 jours avant échéance).
- **MOYENNE — Cascade Réouvert/Retard** : Masquage du retard quand combiné à une réouverture.
- **BASSE — Date passée** : Robustesse défensive ; en pratique `nbRetard > 0` capte le cas avant que la cascade arrive à `prochaineDate`.

### Six-de-Neuf — Contradicteur

**Partie A — Challenge des trouvailles :**

- *Bug 1 (filtre périodicité)* — Défense : peut éviter la pollution du dashboard pour gammes hebdomadaires permanentes en "Cette semaine". Réfutation : c'est précisément le rôle du dashboard d'attirer l'œil sur l'imminence ; le seuil arbitraire crée un angle mort. **Défense réfutée → CONFIRMÉ.**

- *Bug 3a (cascade)* — Défense : la réouverture est un workflow exceptionnel à signaler en priorité, le pulse heartbeat est conçu pour Réouvert. Réfutation : le retard est un manquement objectif (date dépassée), la réouverture est un retravail. Sévérité métier : retard > réouvert. **Défense réfutée → CONFIRMÉ.**

- *Bug 3b (modification SQL backend)* — Défense : `IN (1, 2, 5)` est une convention sémantique de "OT actif" répétée sur 22 emplacements ; `nb_ot_reouvert` et `nb_ot_en_retard` sont **deux dimensions orthogonales** (workflow vs temporel) qui peuvent légitimement se chevaucher sur le statut 5 ; CLAUDE.md interdit la modification du schéma sans raison. Réfutation tentée : double-comptage prétendu. Mais le double-comptage est sémantiquement correct — un OT réouvert dont la date est dépassée EST factuellement en retard. **Défense valide → ANNULÉ.**

**Partie B — Angles morts :**

- Zone non couverte : la modification du sunburst (`GammeSunburst.tsx`) avait été faite dans la même session par l'agent principal — pas un défaut, mais à mentionner pour la traçabilité.
- Hypothèse implicite : le seuil `diff <= 30` pour "Ce mois-ci" reste arbitraire mais n'a pas été remis en cause par l'utilisateur. Conservé.

## Verdict unifié

```
══════════════════════════════════════════════════════
              VERDICT DU COLLECTIF BORG
══════════════════════════════════════════════════════

ZONE ASSIMILÉE : Calcul des statuts de gammes
PROJET : DÉDALE — Tauri v2 / React 18 / TypeScript / SQLite

── DÉVIATIONS CONFIRMÉES ─────────────────────────────
HAUTE    : Filtre joursPeriodicite éliminatoire
MOYENNE  : Cascade Réouvert > Retard inversée
BASSE    : Pas de garde sur prochaineDate dans le passé

── DÉVIATIONS ANNULÉES ───────────────────────────────
BUG 3B   : Retrait du statut 5 de nb_ot_en_retard
           Auto-steelman réussi : sémantique métier orthogonale,
           cohérence sur 22 emplacements, schéma protégé.

── DIRECTIVE DU COLLECTIF ────────────────────────────
Application immédiate des 3 corrections frontend.
Backend Rust et schéma SQL : aucune modification.
══════════════════════════════════════════════════════
```

## Actions exécutées

### Modification 1 — `src/lib/utils/statuts.ts:119-138` (Bug 1 + Bug 2)

`getProximiteStatutId()` :
- Suppression du filtre `joursPeriodicite >= 30/60` ligne 130-132.
- Ajout d'une garde explicite : si `prochaineDate < today`, retourner `null`.
- Le paramètre `joursPeriodicite` est renommé `_joursPeriodicite` pour signaler qu'il n'est plus utilisé (signature publique conservée pour compatibilité avec les 9 consommateurs).
- Commentaire mis à jour pour expliquer la nouvelle sémantique.

### Modification 2 — `src/lib/utils/statuts.ts:140-163` (Bug 3a)

`computeAggregateStatutId()` :
- Inversion des lignes 150-151 : `nbRetard` est désormais testé avant `nbReouvert`.
- Commentaire de cascade mis à jour : `inactif → vide → retard → réouvert → en cours → sans OT → proximité → validé`.

### Backend — non modifié

`gammes.rs`, `dashboard.rs`, `equipements.rs`, `localisations.rs`, `helpers/ot_list.rs`, `recherche.rs` et `migrations/001_initial_schema.sql` : aucune modification.

## Vérification post-assimilation

- `npx tsc --noEmit` : OK, aucune erreur TypeScript.
- Signature publique de `getProximiteStatutId` et `computeAggregateStatutId` inchangée — les 9 consommateurs ne nécessitent aucune adaptation.

## Effets attendus en runtime

1. Les gammes hebdomadaires/quotidiennes avec prochain OT dans ≤ 7 jours remonteront désormais le statut **3 (Cette semaine)** au lieu de **1 (Validé)**. Visible immédiatement dans `GammeList`, `DomaineGammeList`, `FamilleGammeList`, `GammeSunburst`.
2. Les gammes avec un OT en retard ET un OT réouvert remonteront désormais le statut **6 (En retard)** au lieu de **7 (Réouvert)**.
3. Aucune gamme ne perdra son statut "Validé" légitime.

Le Collectif a assimilé. Toute résistance est inutile.
