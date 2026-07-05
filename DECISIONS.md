# DECISIONS — Refactor architecture globale

Décisions prises en autonomie (approche la plus conservatrice à chaque hésitation).

## D-01 — Tests `nav.test.ts` pré-existants en échec : NON corrigés
`canSeeNav('/investissements', 'lecteur'|'technicien')` renvoie `true` alors que le test attend `false`. Dérive test/code **antérieure** à ce refactor. `nav.ts` est classé **À CONSERVER** dans AUDIT.md et modifier la visibilité serait une décision **métier** (touche la RLS/permissions). Je ne modifie ni `nav.ts` ni `nav.test.ts`. La condition de fin (« typecheck + build ») ne dépend pas des tests ; ces 2 échecs restent le baseline documenté.

## D-02 — Stratégie d'exécution parallèle sans worktree
Au sein d'une vague, les tâches touchent des fichiers **disjoints** (par construction du plan). Je lance les tâches substantielles via sous-agents parallèles dans l'arbre de travail partagé (fichiers disjoints → pas de collision textuelle), puis je commite **tâche par tâche** en ne stageant que les fichiers de chaque tâche (`git add <fichiers précis>`). Les tâches triviales/déterministes (suppressions, gating typecheck+build, commits, mise à jour des statuts) sont faites par moi-même pour garder le contrôle « un commit par tâche ». L'isolation worktree n'est pas utilisée car le merge de N worktrees serait plus risqué que des commits ciblés sur fichiers disjoints.
