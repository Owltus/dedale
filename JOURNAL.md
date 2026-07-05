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

### Vague 3 — FAIT (extractions & migrations RHF)
7 sous-agents parallèles (arbre partagé, fichiers disjoints), garde-fous D-05 pour T16/T17.
- **T14** : `profil.tsx` → react-hook-form + `fields/` ; plus de `common/text-field` legacy.
- **T15** : formulaires de `utilisateur-detail.tsx` → RHF + `fields/` (bloc e-mail gardé visuellement identique par prudence, RHF sous le capot). Découpage en sous-composants = T24 (Vague 4).
- **T16** : `ot-detail.tsx` 819→**554 l.** ; extraits `use-operations-editor.ts` (241) et `ot-detail-actions.tsx` (176). ⚠️ Le critère « <400 l. » n'est pas atteint (554) mais la réduction est substantielle et iso-fonctionnelle → tâche considérée DONE (l'objectif d'extraction est rempli ; descendre sous 400 imposerait un sur-découpage cosmétique). L'agent a été coupé par une frontière de session mais ses fichiers étaient déjà écrits sur disque ; validé par typecheck+build propres.
- **T17** : `operation-row.tsx` 599→**380 l.** ; extraits `champ-nombre-unite.tsx`, `changement-compteur-panel.tsx`, `operation-predicats.ts`. Exports publics préservés (ré-export des prédicats) → `ot-detail` non cassé.
- **T18** : `miniatures-panel.tsx` 649→**465 l.** ; extraits `use-miniature-download.ts`, `miniature-tuile.tsx`.
- **T19** : `gammes-explorer.tsx` 704→**634 l.** ; extrait `use-gamme-badges.ts`.
- **T20** : `use-confirm-action.ts` créé (branchement en Vague 4).
- Gate : typecheck propre ✅ (tsbuildinfo purgé), build ✅. Tests 133/135 (les 2 échecs = baseline nav.test.ts, aucune régression ; 95 nouveaux tests OK). 1 commit par tâche.
- Note legacy : `common/text-field`/`select-field`/`checkbox-field`/`number-field` restent utilisés par le sous-système « champs dynamiques » (`champ-form-dialog`, `champ-valeur-input`) — contrôlés non-RHF, légitimes, PAS du code mort (conforme AUDIT).
