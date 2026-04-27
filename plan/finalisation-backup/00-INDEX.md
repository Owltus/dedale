# Plan — Finalisation de la feature Sauvegarde

## Contexte

L'audit Borg du 27 avril 2026 (`.claude/skills/borg/logs/BORG-2026-04-27-001-backup-freeze.md`) a identifié et corrigé les trois causes critiques du freeze UI pendant `backup_create` : commande synchrone bloquant le main thread, absence de `busy_timeout` SQLite, et throttling d'événements par count fixe. Les fixes critiques sont en place et compilent.

Ce plan finalise la feature en appliquant les améliorations non critiques restantes : conformité interne (PRAGMAs SQLite complets), résilience (pause des queries TanStack pendant le backup), traçabilité (logs de timing par phase), et capitalisation (documentation du pattern `async + spawn_blocking` dans les règles internes).

Aucune étape n'est critique au sens des règles d'audit `/borg` automatique : pas de modification de schéma, pas de migration, pas de mot-clé SQL destructif, pas plus de 5 fichiers touchés simultanément.

## Phases

| # | Fichier | Phase | Dépend de | Priorité | Effort | Livrable | Critique |
|---|---------|-------|-----------|----------|--------|----------|----------|
| 1 | [1-test-validation-manuel.md](./1-test-validation-manuel.md) | Validation des fixes critiques | — | P0 | 15 min | Confirmation visuelle que le freeze est parti |  |
| 2 | [2-pragmas-snapshot.md](./2-pragmas-snapshot.md) | Hygiène SQLite | — | P1 | 30 min | PRAGMAs complets sur conn src + dst |  |
| 3 | [3-pause-tanstack-queries.md](./3-pause-tanstack-queries.md) | Résilience IPC | — | P2 | 45 min | Pause auto des queries pendant le backup |  |
| 4 | [4-logs-timing-phases.md](./4-logs-timing-phases.md) | Traçabilité | — | P2 | 20 min | `log::info!` par phase pour diagnostic futur |  |
| 5 | [5-doc-pattern-async.md](./5-doc-pattern-async.md) | Capitalisation | — | P2 | 15 min | Pattern documenté dans rust-backend.md |  |
| 6 | [6-verification-finale.md](./6-verification-finale.md) | Vérification | 2,3,4,5 | P0 | 10 min | `cargo check` + `tsc --noEmit` propres |  |

## Ordre d'exécution

1. **Étape 1** d'abord (validation des fixes critiques sans laquelle on ne sait pas si on continue ou si on doit re-débugger)
2. Étapes **2, 4, 5** parallélisables entre elles (touchent des fichiers différents, sans dépendance logique)
3. Étape **3** indépendante mais touche le frontend — peut tourner en parallèle des 2/4/5
4. Étape **6** en dernier (validation après toutes les modifs)

En pratique, exécution séquentielle dans l'ordre du tableau pour rester simple à tracker.

## Fichiers impactés (résumé)

| Couche | Fichiers modifiés | Fichiers nouveaux |
|--------|-------------------|-------------------|
| Backend Rust | `src-tauri/src/db.rs`, `src-tauri/src/commands/backup.rs` | — |
| Frontend | `src/hooks/use-backup.ts` | — |
| Documentation | `.claude/rules/rust-backend.md`, `.claude/skills/borg/logs/BORG-2026-04-27-001-backup-freeze.md` | — |

| **Total** | **4 modifiés** | **0 nouveaux** |
