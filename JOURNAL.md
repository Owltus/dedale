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
