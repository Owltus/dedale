# DECISIONS — Refactor architecture globale

Décisions prises en autonomie (approche la plus conservatrice à chaque hésitation).

## D-01 — Tests `nav.test.ts` pré-existants en échec : NON corrigés
`canSeeNav('/investissements', 'lecteur'|'technicien')` renvoie `true` alors que le test attend `false`. Dérive test/code **antérieure** à ce refactor. `nav.ts` est classé **À CONSERVER** dans AUDIT.md et modifier la visibilité serait une décision **métier** (touche la RLS/permissions). Je ne modifie ni `nav.ts` ni `nav.test.ts`. La condition de fin (« typecheck + build ») ne dépend pas des tests ; ces 2 échecs restent le baseline documenté.

## D-02 — Stratégie d'exécution parallèle sans worktree
Au sein d'une vague, les tâches touchent des fichiers **disjoints** (par construction du plan). Je lance les tâches substantielles via sous-agents parallèles dans l'arbre de travail partagé (fichiers disjoints → pas de collision textuelle), puis je commite **tâche par tâche** en ne stageant que les fichiers de chaque tâche (`git add <fichiers précis>`). Les tâches triviales/déterministes (suppressions, gating typecheck+build, commits, mise à jour des statuts) sont faites par moi-même pour garder le contrôle « un commit par tâche ». L'isolation worktree n'est pas utilisée car le merge de N worktrees serait plus risqué que des commits ciblés sur fichiers disjoints.

## D-03 — T13 realtime opérations de gamme : posé dans l'HÔTE, pas la brique
PLAN.md T13 cible `gamme-operations-section.tsx`, mais ce composant est une **brique partagée** (fiche gamme de site ET panneau Bibliothèque) dont le commentaire d'en-tête impose explicitement que « le realtime des opérations reste porté par l'HÔTE ». Pour respecter cette architecture (et éviter un double abonnement quand la biblio l'affiche), j'ajoute `useRealtimeRefresh('operations', gammesQueries.all())` dans l'hôte `gamme-detail.tsx` (fiche de site) — la Bibliothèque s'y abonne déjà de son côté. Résultat fonctionnel identique à l'intention de T13 (les opérations d'une gamme de site se rafraîchissent en live).

## D-08 — T25 : helpers partagés plutôt qu'un hook unique
Le PLAN visait « un seul hook paramétré » pour les 3 adaptateurs de drill. Or ces hooks diffèrent par leur **route TanStack typée** (`getRouteApi('/_app/xxx/$')` + littéral `to: '/xxx/$'`) : un hook unique paramétré par la route obligerait à élargir le type de `to` et à insérer des casts `as never` (perte de sûreté de typage des routes, contraire à « pas de any/cast douteux »). Choix conservateur : je garde les 3 hooks (consommateurs INCHANGÉS, zéro churn) mais j'extrais la logique réellement dupliquée et source d'erreurs — découpage/réassemblage du `_splat` — dans `drill-splat.ts` (`splatCatSegs`/`joinSplat`, testés). La duplication significative est éliminée sans toucher au typage des routes. T25 = DONE (intention respectée, forme adaptée à la contrainte de typage).

## D-06 — T23 : transitions DI laissées en 1 clic (pas de useConfirmAction)
Les transitions de la demande d'intervention (prendre en charge / clôturer / rouvrir) sont des mutations DIRECTES en un clic, SANS confirmation dans le code actuel. Les passer sous `useConfirmAction` aurait AJOUTÉ une étape de confirmation (donc changé le comportement) et exigé d'inventer des libellés inexistants. Choix conservateur : seule la partie (a) de T23 (suppression → `useConfirmDelete`, la dette C8) est appliquée ; les transitions restent inchangées. T23 = DONE pour son périmètre iso-fonctionnel.

## D-07 — Conformité ESLint strict après migrations RHF
Le hook de garde ne lance QUE le typecheck, pas ESLint. Les migrations RHF/extractions (V3/V4) ont introduit 6 erreurs lint (toutes dans mes fichiers). Corrigées sans changer le comportement : `onSubmit={() => void form.handleSubmit(fn)()}` (patron lint-clean déjà utilisé dans le code, ex. site-form-dialog), `form.watch` → `useWatch` (compatible react-compiler), `type`→`interface`, `z.string().email()`→`z.email()`, `${n}`→`${String(n)}`, et un `eslint-disable` justifié sur la sentinelle `[P] extends [void]` de `useConfirmAction`. `npm run lint` repasse à 0 erreur / 0 warning.

## D-05 — Vague 3 : découplage T16/T17 (ot-detail ↔ operation-row)
`ot-detail.tsx` importe de `operation-row.tsx` (`OperationRow`, `estCompteur`, `estMesureExecution`, `estCompteurCumulatif`, type `OperationEdit`). T16 (découpe ot-detail) et T17 (découpe operation-row) tournent en parallèle. Pour éviter toute collision : **T17 préserve à l'identique tous les exports publics de `operation-row.tsx`** (les prédicats extraits vers un module sont RÉ-EXPORTÉS depuis `operation-row.tsx`), et **T16 ne touche pas `operation-row.tsx`**. Ainsi les deux tâches restent sur des fichiers effectivement disjoints du point de vue des consommateurs.

## D-04 — T12 realtime prestataire : AJOUT dans OtPanel, sans retrait du GammesPanel
L'abonnement `ordres_travail` existant dans `GammesPanel` sert légitimement les badges de statut des gammes. Plutôt que de le déplacer, j'AJOUTE le même abonnement dans `OtPanel` (le panneau qui liste réellement les OT). Le hook `useRealtimeRefresh` partage un seul canal par table (refcompté) → aucun coût de double abonnement. La liste OT du prestataire se rafraîchit désormais en live.
