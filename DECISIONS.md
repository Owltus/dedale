# DECISIONS — Refactor architecture globale

Décisions prises en autonomie (approche la plus conservatrice à chaque hésitation).

## D-01 — Tests `nav.test.ts` pré-existants en échec : NON corrigés
`canSeeNav('/investissements', 'lecteur'|'technicien')` renvoie `true` alors que le test attend `false`. Dérive test/code **antérieure** à ce refactor. `nav.ts` est classé **À CONSERVER** dans AUDIT.md et modifier la visibilité serait une décision **métier** (touche la RLS/permissions). Je ne modifie ni `nav.ts` ni `nav.test.ts`. La condition de fin (« typecheck + build ») ne dépend pas des tests ; ces 2 échecs restent le baseline documenté.

## D-02 — Stratégie d'exécution parallèle sans worktree
Au sein d'une vague, les tâches touchent des fichiers **disjoints** (par construction du plan). Je lance les tâches substantielles via sous-agents parallèles dans l'arbre de travail partagé (fichiers disjoints → pas de collision textuelle), puis je commite **tâche par tâche** en ne stageant que les fichiers de chaque tâche (`git add <fichiers précis>`). Les tâches triviales/déterministes (suppressions, gating typecheck+build, commits, mise à jour des statuts) sont faites par moi-même pour garder le contrôle « un commit par tâche ». L'isolation worktree n'est pas utilisée car le merge de N worktrees serait plus risqué que des commits ciblés sur fichiers disjoints.

## D-03 — T13 realtime opérations de gamme : posé dans l'HÔTE, pas la brique
PLAN.md T13 cible `gamme-operations-section.tsx`, mais ce composant est une **brique partagée** (fiche gamme de site ET panneau Bibliothèque) dont le commentaire d'en-tête impose explicitement que « le realtime des opérations reste porté par l'HÔTE ». Pour respecter cette architecture (et éviter un double abonnement quand la biblio l'affiche), j'ajoute `useRealtimeRefresh('operations', gammesQueries.all())` dans l'hôte `gamme-detail.tsx` (fiche de site) — la Bibliothèque s'y abonne déjà de son côté. Résultat fonctionnel identique à l'intention de T13 (les opérations d'une gamme de site se rafraîchissent en live).

## D-04 — T12 realtime prestataire : AJOUT dans OtPanel, sans retrait du GammesPanel
L'abonnement `ordres_travail` existant dans `GammesPanel` sert légitimement les badges de statut des gammes. Plutôt que de le déplacer, j'AJOUTE le même abonnement dans `OtPanel` (le panneau qui liste réellement les OT). Le hook `useRealtimeRefresh` partage un seul canal par table (refcompté) → aucun coût de double abonnement. La liste OT du prestataire se rafraîchit désormais en live.
