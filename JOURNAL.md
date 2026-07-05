# JOURNAL — Refactor architecture globale

Branche : `refactor/architecture-globale` (jamais de push).

## Baseline (avant travaux)
- `npm run typecheck` : ✅ vert
- `npm run build` : ✅ vert
- `npm run test` : ⚠️ **2 échecs pré-existants** dans `src/lib/nav.test.ts` (`canSeeNav('/investissements', 'lecteur')` et `('/investissements', 'technicien')` renvoient `true`, le test attend `false`). Antérieur à mon travail. Non corrigé (voir DECISIONS.md). 97/99 passent.

## Journal des vagues

### Préparation — FAIT
- Branche `refactor/architecture-globale` créée depuis `main`.
- Commit docs audit + plan.
- JOURNAL.md + DECISIONS.md créés.

### Vague 1 — FAIT (filet de sécurité & code mort)
- **T01** : supprimés `use-biblio-drill.ts` + trio champs legacy (`switch-field`, `description-field`, `textarea-field`). Vérifié : les refs restantes pointent vers `common/fields/*` (génération RHF vivante), pas les legacy racine. Typecheck OK.
- **T02** : `slug.test.ts` — 16 tests (slugify + segOfUnique symétrie/collisions).
- **T03** : `champs.test.ts` — 28 tests (prepareChamps 6 règles + round-trip + formatChampValeur).
- **T04** : `form.test.ts` — 25 tests (pgCode + mapping SQLSTATE + fieldErrors Zod v4).
- **T05** : `scope.test.ts` — 26 tests (resolvePorteeScope + sousCategoriesNiveau2 + scopeMatches).
- Total nouveaux tests : **95, tous verts**. Gate : typecheck ✅, build ✅.
- Commits : 1 par tâche (T01…T05).
- Réalisation : T01 par moi ; T02–T05 via 4 sous-agents parallèles (worktree partagé, fichiers disjoints).

**Ajustement noté pour T13 (Vague 2)** : `gamme-operations-section` est une brique PARTAGÉE dont le commentaire impose que le realtime soit porté par l'HÔTE → l'abonnement `operations` ira dans `gamme-detail.tsx` (fiche de site), pas dans la brique. Voir DECISIONS D-03.

### Vague 2 — FAIT (couverture Realtime)
- **T06** Sites, **T07** Utilisateurs (`users`), **T08** Investissements, **T09** Travaux (`interventions_travaux`), **T10** Documents : `useRealtimeRefresh(table, xxxQueries.all())` ajouté sur chaque liste.
- **T11** Localisations : 3 abonnements (`batiments`/`niveaux`/`locaux`) dans `LocalisationsExplorer` — comble le seul explorer sans live-refresh.
- **T12** Prestataire : abonnement `ordres_travail` AJOUTÉ dans `OtPanel` (celui du panneau Gammes conservé pour les badges ; canal partagé refcompté → sans surcoût). Voir D-04.
- **T13** Gamme de site : abonnement `operations` posé dans l'HÔTE `gamme-detail.tsx` (pas dans la brique partagée). Voir D-03.
- Gate : typecheck ✅, build ✅. 1 commit par tâche (T06…T13).
- Rappel P0 : l'effet live dépend de la publication `supabase_realtime` côté backend (hors périmètre). Le code front est sûr et inerte si la table n'est pas publiée.
- Réalisation : par moi-même (insertions triviales, fichiers disjoints), cf. D-02.
