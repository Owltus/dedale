# Plan de refactoring — Audit avril 2026

## Contexte

Audit complet du codebase Mantis (GMAO) réalisé le 2026-04-06.
8 agents parallèles ont scanné : ~130 commandes Rust, 33 routes React, 31 composants partagés, 18 hooks, 26 schemas Zod, 48+ types TS.

**Bilan global** : architecture solide, zéro faille de sécurité, alignement TS/Rust/Zod/SQL parfait. Les problèmes identifiés sont de la **dette technique** (duplication, composants trop gros, patterns incohérents).

## Phases

| # | Fichier | Phase | Priorité | Effort | Livrable |
|---|---------|-------|----------|--------|----------|
| 1 | [01-rust-ot-list-helper.md](./01-rust-ot-list-helper.md) | Extraire helper OT liste partagé | P0 | 2h | ~500 lignes dupliquées éliminées |
| 2 | [02-rust-collect-pattern.md](./02-rust-collect-pattern.md) | Remplacer Vec loop par .collect() | P0 | 1h | 46 occurrences simplifiées |
| 3 | [03-frontend-gammes-detail.md](./03-frontend-gammes-detail.md) | Refactorer gammes/[id].tsx | P1 | 3h | 708 → ~150 lignes + 4 sous-composants |
| 4 | [04-frontend-documents-page.md](./04-frontend-documents-page.md) | Refactorer documents/index.tsx | P1 | 2h | 452 → ~120 lignes + 3 sous-composants |
| 5 | [05-frontend-ot-detail.md](./05-frontend-ot-detail.md) | Refactorer ordres-travail/[id].tsx | P1 | 2h | 402 → ~150 lignes + 2 sous-composants |
| 6 | [06-frontend-statuts-compute.md](./06-frontend-statuts-compute.md) | Centraliser calcul statut | P2 | 1h | 7 duplications éliminées |
| 7 | [07-rust-dashboard-filter-map.md](./07-rust-dashboard-filter-map.md) | Fix perte silencieuse dashboard | P2 | 30min | 6 .filter_map corrigés |
| 8 | [08-rust-naming-consistency.md](./08-rust-naming-consistency.md) | Standardiser nommage constantes SQL | P2 | 30min | Cohérence inter-fichiers |
| 9 | [09-frontend-dead-code.md](./09-frontend-dead-code.md) | Supprimer code mort | P3 | 15min | 3 composants supprimés |
| 10 | [10-frontend-large-shared.md](./10-frontend-large-shared.md) | Découper composants partagés | P3 | 2h | ImagePicker, Sidebar, ContratDialogs |

## Ordre d'exécution

Les phases sont **indépendantes** — elles peuvent être exécutées dans n'importe quel ordre. Regroupement suggéré :

**Sprint 1 — Rust** (P0 + P2 Rust) :
1. Phase 1 — Helper OT liste
2. Phase 2 — Pattern .collect()
3. Phase 7 — Fix dashboard filter_map
4. Phase 8 — Nommage constantes

**Sprint 2 — Frontend pages** (P1) :
5. Phase 3 — gammes/[id].tsx
6. Phase 4 — documents/index.tsx
7. Phase 5 — ordres-travail/[id].tsx

**Sprint 3 — Frontend nettoyage** (P2 + P3) :
8. Phase 6 — Statuts compute
9. Phase 9 — Code mort
10. Phase 10 — Composants partagés

## Ce qui NE nécessite PAS de refactoring

- Types TS ↔ Rust : alignement parfait
- Schemas Zod ↔ SQL : 100% des CHECK constraints mirrées
- Query keys TanStack : factory pattern cohérent, invalidation via `onSettled`
- Sécurité SQL : `params![]` partout, zéro `.unwrap()`, zéro injection
- Virtualisation CardList : déjà en place avec `@tanstack/react-virtual`
- Pattern DRY dans `demandes.rs` (DI_COLS + row_to_di) : modèle à suivre

## Fichiers impactés (total estimé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Rust commands | 8 | 1 (helpers/ot_list.rs) |
| Frontend pages | 3 | 9 (sous-composants extraits) |
| Frontend shared | 3 | 0 (suppression) |
| Frontend utils | 1 | 1 (statuts-compute.ts) |
| **Total** | **15** | **11** |
