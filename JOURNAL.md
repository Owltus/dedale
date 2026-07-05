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
