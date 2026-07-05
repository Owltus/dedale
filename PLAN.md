# PLAN — Refactor front Dédale

> Découpage du refactor issu de `AUDIT.md` en **tâches petites, indépendantes et vérifiables**. Ordonnées de la **moins risquée** à la **plus risquée**. Chaque tâche est **iso-fonctionnelle** (aucun changement de comportement observable) sauf mention explicite.
>
> **Contrainte** : front pur. On ne touche pas aux `.env`, à l'infra, ni au schéma SQL.
>
> **Validation par défaut de CHAQUE tâche** : `npm run typecheck` OK · `npm run lint` OK · `npm run build` OK · comportement identique. Le hook `.claude/hooks/check.mjs` type-check déjà après chaque édition. Les critères ci-dessous **ajoutent** le contrôle spécifique.
>
> **Statut** : chaque tâche démarre à `TODO`.

## Prérequis (P0 — hors code, à trancher avec le PO avant la Vague 2)

**P0 — Publication Realtime.** Confirmer quelles tables (`sites`, `utilisateurs`/`profils`, `investissements`, `travaux`, `batiments`/`niveaux`/`locaux`, `documents`) appartiennent à la publication `supabase_realtime` (+ `REPLICA IDENTITY FULL` pour diffuser les DELETE sous RLS). C'est une étape **backend**. Les tâches T06–T13 restent **iso-fonctionnelles et sûres** même si la publication n'est pas encore faite (l'abonnement front reste inerte, sans erreur) — mais le live-refresh ne sera *effectif* qu'une fois la table publiée. **Statut : TODO (backend/PO).**

---

## Vague 1 — Filet de sécurité & code mort *(risque : minime)*

Fichiers tous distincts → parallélisables.

### T01 — Supprimer le code mort confirmé — `DONE`
- **Objectif** : retirer les fichiers sans consommateur.
- **Fichiers** : suppr. `src/hooks/use-biblio-drill.ts`, `src/components/common/switch-field.tsx`, `src/components/common/description-field.tsx`, `src/components/common/textarea-field.tsx`.
- **Validation** : `grep -rn "biblio-drill\|/switch-field'\|/description-field'\|/textarea-field'" src` ne renvoie plus rien (formes `./` **et** `@/`) ; typecheck + build OK.

### T02 — Tests unitaires `slug.ts` — `DONE`
- **Objectif** : verrouiller `slugify` / `segOfUnique` (symétrie génération/résolution, unicité entre frères).
- **Fichiers** : nouveau `src/lib/slug.test.ts`.
- **Validation** : `npm run test` vert, cas frères homonymes couverts.

### T03 — Tests unitaires `champs.ts` — `DONE`
- **Objectif** : verrouiller `prepareChamps` (6 règles + garde-fou taille), `parseChamps`/`serializeChamps`, `formatChampValeur`.
- **Fichiers** : nouveau `src/lib/champs.test.ts`.
- **Validation** : `npm run test` vert.

### T04 — Tests unitaires `form.ts` — `DONE`
- **Objectif** : verrouiller le mapping SQLSTATE→FR (`42501`, `23505`, `23503`, `PGRST116`) de `writeErrorMessage`/`deleteErrorMessage`/`fieldErrors`.
- **Fichiers** : nouveau `src/lib/form.test.ts`.
- **Validation** : `npm run test` vert.

### T05 — Tests unitaires `scope.ts` — `DONE`
- **Objectif** : verrouiller `resolvePorteeScope`, `sousCategoriesNiveau2`, `scopeMatches`, `estCommunOuDuSite`.
- **Fichiers** : nouveau `src/lib/scope.test.ts`.
- **Validation** : `npm run test` vert.

---

## Vague 2 — Couverture Realtime *(risque : faible)* — dépend de P0

Chaque tâche ajoute/rectifie un appel `useRealtimeRefresh(table, xxxQueries.all())` sur un écran. Fichiers distincts → parallélisables. Modèle à suivre : `OT_QUERY_KEYS`.

### T06 — Realtime liste Sites — `DONE`
- **Fichiers** : `src/routes/_app/sites.tsx` — `useRealtimeRefresh('sites', sitesQueries.all())`.
- **Validation** : création/suppression d'un site dans un 2ᵉ onglet rafraîchit la liste sans F5 (si `sites` publiée) ; sinon aucun effet ni erreur.

### T07 — Realtime liste Utilisateurs — `DONE`
- **Fichiers** : `src/routes/_app/utilisateurs/index.tsx`.
- **Validation** : idem (table utilisateurs/profils).

### T08 — Realtime liste Investissements — `DONE`
- **Fichiers** : `src/routes/_app/investissements/index.tsx`.

### T09 — Realtime liste Travaux — `DONE`
- **Fichiers** : `src/routes/_app/travaux/index.tsx`.

### T10 — Realtime liste Documents — `DONE`
- **Fichiers** : `src/routes/_app/documents.tsx` — aligner sur le dashboard qui s'abonne déjà à `documents`.

### T11 — Realtime explorer Localisations — `DONE`
- **Fichiers** : `src/features/localisations/components/localisations-explorer.tsx` — abonnements `batiments`/`niveaux`/`locaux` (clés `localisationsQueries.all()`).
- **Validation** : ajout d'un bâtiment/niveau dans un 2ᵉ onglet apparaît sans F5.

### T12 — Corriger le Realtime dans `prestataire-detail` — `DONE`
- **Objectif** : déplacer/ajouter l'abonnement `ordres_travail` dans le **panneau OT** (aujourd'hui posé dans le panneau Gammes).
- **Fichiers** : `src/features/prestataires/components/prestataire-detail.tsx`.
- **Validation** : clôturer un OT ailleurs met à jour l'onglet OT du prestataire.

### T13 — Realtime opérations de gamme (site) — `DONE`
- **Objectif** : symétriser avec la version biblio (`operations`).
- **Fichiers** : `src/features/gammes/components/gamme-operations-section.tsx`.
- **Validation** : modif d'une opération se reflète en live sur la fiche gamme de site.

---

## Vague 3 — Extractions & migrations RHF *(risque : moyen)*

Fichiers distincts (chacun un fichier cible + éventuels nouveaux fichiers) → parallélisables.

### T14 — Migrer `profil.tsx` vers RHF + `fields/` — `DONE`
- **Objectif** : remplacer `useState` + `safeParse` + ancien `TextField` par `react-hook-form` + `zodResolver` + `common/fields/*`.
- **Fichiers** : `src/routes/_app/profil.tsx`.
- **Validation** : mêmes champs/validations/toasts ; plus aucun import de `common/text-field` dans ce fichier ; comportement identique (identité, e-mail, mot de passe).

### T15 — Migrer les formulaires de `utilisateur-detail.tsx` vers RHF — `DONE`
- **Objectif** : `ProfileForm`/`EmailForm` → RHF + `fields/` (le découpage du fichier vient en T24).
- **Fichiers** : `src/features/utilisateurs/components/utilisateur-detail.tsx`.
- **Validation** : plus d'ancien `TextField` ; validations et écritures identiques.

### T16 — Découper `ot-detail.tsx` — `DONE`
- **Objectif** : extraire `useOperationsEditor(otId)` (état `edits`/`dirtyOps`/`saveAllOps` + `useBlocker` + `useSaveShortcut`), `<OtDetailActions>` (headerActions), et un module de transitions de statut.
- **Fichiers** : `src/features/ordres-travail/components/ot-detail.tsx` + nouveaux `use-operations-editor.ts`, `ot-detail-actions.tsx` (dans la feature).
- **Validation** : fiche OT identique (saisie, sauvegarde groupée, blocage navigation, boutons de statut) ; `ot-detail.tsx` < 400 l.

### T17 — Découper `operation-row.tsx` — `DONE`
- **Objectif** : extraire `ChampNombreUnite`, le panneau « changement de compteur », et les prédicats métier vers un module.
- **Fichiers** : `src/features/ordres-travail/components/operation-row.tsx` + nouveaux sous-fichiers.
- **Validation** : saisie d'opération/relevé/compteur identique ; fichier principal nettement réduit.

### T18 — Découper `miniatures-panel.tsx` — `DONE`
- **Objectif** : extraire les actions (ZIP/download) et la tuile en composants.
- **Fichiers** : `src/features/miniatures/components/miniatures-panel.tsx` + nouveaux.
- **Validation** : sélection/upload/ZIP/suppression identiques.

### T19 — Extraire `useGammeBadges` de `gammes-explorer.tsx` — `DONE`
- **Objectif** : sortir la logique de badges de statut agrégés dans un hook (prépare T28).
- **Fichiers** : `src/features/gammes/components/gammes-explorer.tsx` + nouveau `use-gamme-badges.ts`.
- **Validation** : badges d'agrégat identiques.

### T20 — Créer le hook `useConfirmAction` — `DONE`
- **Objectif** : symétrique de `useConfirmDelete` pour les transitions de statut (ouvrir → mutate → toast succès/erreur traduit → fermer), avec `dialogProps` à étaler sur `ConfirmDialog`.
- **Fichiers** : nouveau `src/hooks/use-confirm-action.ts` (+ éventuel test).
- **Validation** : hook typé strict, sans usage encore (branché en Vague 4).

---

## Vague 4 — Application de `useConfirmAction` & découpage `utilisateur-detail` *(risque : moyen)* — dépend de T20 (et T15 pour T24)

Fichiers distincts → parallélisables.

### T21 — Brancher `useConfirmAction` sur `investissement-detail` — `TODO`
- **Fichiers** : `src/features/investissements/components/investissement-detail.tsx`.
- **Validation** : transitions Refuser/Réactiver identiques, moins de `useState` local.

### T22 — Brancher `useConfirmAction` sur `travaux-detail` — `TODO`
- **Fichiers** : `src/features/travaux/components/travaux-detail.tsx`.
- **Validation** : transitions Annuler/Réactiver identiques.

### T23 — `di-detail` : delete via `useConfirmDelete` + transitions via `useConfirmAction` — `TODO`
- **Objectif** : supprimer la suppression réimplémentée à la main (C8) et factoriser les transitions.
- **Fichiers** : `src/features/demandes/components/di-detail.tsx`.
- **Validation** : suppression + transitions (prise en charge/clôture/réouverture) identiques.

### T24 — Découper `utilisateur-detail.tsx` en sous-composants — `TODO` *(après T15)*
- **Objectif** : séparer Identité / Sites / Administration ; brancher `useConfirmAction` (activer/anonymiser).
- **Fichiers** : `src/features/utilisateurs/components/utilisateur-detail.tsx` + nouveaux sous-composants.
- **Validation** : fiche utilisateur identique ; fichier principal < 300 l.

---

## Vague 5 — Unifier les adaptateurs de drill *(risque : moyen-élevé — SOLO)*

### T25 — Fusionner les 3 adaptateurs de drill — `TODO`
- **Objectif** : un seul hook paramétré par la route, remplaçant `use-gammes-drill` / `use-equipements-drill` / `use-biblio-tree-drill`.
- **Fichiers** : `src/hooks/use-gammes-drill.ts`, `use-equipements-drill.ts`, `use-biblio-tree-drill.ts` + consommateurs `gammes-explorer.tsx`, `equipements-explorer.tsx`, `catalogue-panel.tsx`, `gammes-biblio-panel.tsx`.
- **Pourquoi SOLO** : touche des fichiers partagés par plusieurs explorers.
- **Validation** : navigation par URL (descente/remontée/racine/renommage) identique sur les 4 écrans.

---

## Vague 6 — Unifier la resync d'URL *(risque : moyen — SOLO)*

### T26 — Unifier `useLeafResync` et la resync inline de `useCatalogueDrill` — `TODO`
- **Objectif** : une seule implémentation (option `layout` pour le timing `useLayoutEffect`/`useEffect`).
- **Fichiers** : `src/hooks/use-leaf-resync.ts`, `src/hooks/use-catalogue-drill.ts`.
- **Validation** : renommer l'élément ouvert réécrit l'URL sans flash, à l'identique, sur tous les explorers.

---

## Vague 7 — Généraliser `CataloguePanel` & fondre `gammes-biblio-panel` *(risque : ÉLEVÉ — SOLO)*

### T27 — Fondre `gammes-biblio-panel` dans `CataloguePanel` généralisé — `TODO`
- **Objectif** : ajouter à `CataloguePanel` les points d'extension `renderCard`, `itemPath`, action « copier conteneur » ; réécrire `gammes-biblio-panel` comme configuration (élimine ~600 l. de duplication, C3/R1).
- **Fichiers** : `src/features/bibliotheque/components/catalogue-panel.tsx`, `src/features/gammes/components/gammes-biblio-panel.tsx` (+ éventuels sous-composants gammes conservés : `GammeCard`, `CopierContenuDialog`, `GammeBiblioDetail`).
- **Pourquoi SOLO / ÉLEVÉ** : `catalogue-panel` est consommé aussi par `modeles-equipements` et `modeles-operations` → non-régression à vérifier sur les 4 usages.
- **Validation** : les 4 panneaux (gammes biblio, modèles équip., gammes-types, + le comportement générique) restent iso-fonctionnels (CRUD catégories, scope, export, drill, détail).

---

## Vague 8 — Shell commun d'explorer *(risque : ÉLEVÉ — SOLO)* — après T19 et T25

### T28 — Extraire `<CatalogueExplorer>` (gammes + équipements) — `TODO`
- **Objectif** : shell commun paramétré pour `gammes-explorer` et `equipements-explorer` (header par profondeur, dialogs catégorie, états vides, `makeVirtual`/`realCats`).
- **Fichiers** : `src/features/gammes/components/gammes-explorer.tsx`, `src/features/equipements/components/equipements-explorer.tsx` + nouveau shell commun.
- **Validation** : les deux explorateurs restent iso-fonctionnels (drill, CRUD catégorie, badges via `useGammeBadges`, realtime).

---

## Vague 9 — Migrer `ListRow.actions` restants → `menuActions` *(risque : moyen — SOLO)*

### T29 — Basculer les pages liste résiduelles vers `menuActions` — `TODO`
- **Objectif** : uniformiser sur le menu contextuel (retirer l'usage legacy `actions`).
- **Fichiers** : les pages liste utilisant encore la prop `actions` de `ListRow` (à recenser : `grep -rn "actions=" src | grep ListRow`).
- **Pourquoi SOLO** : touche plusieurs pages liste déjà modifiées en Vagues 2/4 → éviter tout chevauchement.
- **Validation** : actions par ligne identiques (clic droit / appui long / kebab), filtrées par permissions.

---

## Vague 10 — Désambiguïser les homonymes *(risque : faible mais TRANSVERSE — SOLO)*

### T30 — Renommer les fichiers homonymes — `TODO`
- **Objectif** : lever la confusion `common/operation-row` vs `ordres-travail/operation-row`, et `ui/date-field` vs `fields/date-field`.
- **Fichiers** : renommages + mise à jour de tous les importateurs.
- **Pourquoi SOLO** : renommage global touchant de nombreux imports.
- **Validation** : typecheck/build OK, aucun import cassé.

---

## Vague 11 — AlertDialog (sémantique confirmations) *(risque : ÉLEVÉ — SOLO)*

### T31 — Introduire `ui/alert-dialog` et y porter `ConfirmDialog` — `TODO`
- **Objectif** : ajouter la primitive shadcn `alert-dialog` (absente) et faire porter `ConfirmDialog`/`ConfirmDeleteDialog` dessus (`role="alertdialog"`, focus par défaut).
- **Fichiers** : nouveau `src/components/ui/alert-dialog.tsx` ; `src/components/common/confirm-dialog.tsx` (+ ajustement éventuel `dialog-shell` ou `confirm-delete-dialog`).
- **Pourquoi SOLO / ÉLEVÉ** : `ConfirmDialog` est la base de **26 sites** ; parité de comportement (fermeture au clic extérieur, Échap, focus) à valider soigneusement.
- **Validation** : toutes les confirmations (suppressions, actions de statut) restent iso-fonctionnelles ; a11y améliorée (annonce `alertdialog`).

---

## Vague 12 — Nettoyages optionnels *(risque : faible — parallélisables si fichiers distincts)*

### T32 — Variante `Sheet` pour les grands formulaires — `TODO` *(optionnel)*
- **Objectif** : exposer une variante `as="sheet"` de `DialogShell` (header/corps/pied déjà découplés) et l'appliquer aux `FormDialog size="xl"/"full"` (modèles d'équipement, gammes, contrats).
- **Fichiers** : `src/components/common/dialog-shell.tsx` + form-dialogs concernés (⚠️ **change le rendu** : panneau latéral — à valider avec le PO, **non iso-fonctionnel visuellement**).
- **Validation** : décision PO ; formulaires fonctionnellement identiques.

### T33 — Converger les sélecteurs natifs — `TODO` *(optionnel)*
- **Objectif** : réduire à un seul style de dropdown là où c'est pertinent (garder le natif seulement là où il est volontaire).
- **Fichiers** : `common/select-menu.tsx`, usages de `ui/select` nu.
- **Validation** : rendu/comportement des sélecteurs identiques.

### T34 — Nettoyage `any` & imports inter-couches — `TODO` *(optionnel)*
- **Objectif** : retirer les `any`/`as any` évitables (props typées strictement) et remplacer les imports **inter-couches** relatifs par l'alias `@/` (laisser les imports intra-feature).
- **Fichiers** : transverse, par petits lots.
- **Validation** : typecheck OK ; `grep` des `any` en baisse ; ESLint OK.

---

## Récapitulatif des vagues

| Vague | Tâches | Nature | Parallélisable |
| --- | --- | --- | --- |
| 1 | T01 · T02 · T03 · T04 · T05 | Code mort + tests | ✅ 5 en //, fichiers distincts |
| 2 | T06 · T07 · T08 · T09 · T10 · T11 · T12 · T13 | Realtime (après P0) | ✅ 8 en //, fichiers distincts |
| 3 | T14 · T15 · T16 · T17 · T18 · T19 · T20 | Extractions + RHF + hook | ✅ 7 en //, fichiers distincts |
| 4 | T21 · T22 · T23 · T24 | `useConfirmAction` + split user | ✅ 4 en // (T24 après T15) |
| 5 | T25 | Fusion adaptateurs drill | ⛔ SOLO |
| 6 | T26 | Unif. resync URL | ⛔ SOLO |
| 7 | T27 | Fondre `gammes-biblio-panel` | ⛔ SOLO (risque élevé) |
| 8 | T28 | Shell `CatalogueExplorer` | ⛔ SOLO (après T19, T25) |
| 9 | T29 | `menuActions` | ⛔ SOLO (transverse) |
| 10 | T30 | Renommage homonymes | ⛔ SOLO (transverse) |
| 11 | T31 | AlertDialog | ⛔ SOLO (risque élevé) |
| 12 | T32 · T33 · T34 | Nettoyages optionnels | ✅ si fichiers distincts |

### Règles de parallélisation appliquées
- Deux tâches modifiant le **même fichier** ne sont jamais dans la même vague (ex. T15 puis T24 sur `utilisateur-detail.tsx` ; T19 puis T28 sur `gammes-explorer.tsx` ; T25 puis T27/T28 sur les panneaux/explorers).
- Les tâches **transverses** (fusions de hooks partagés, renommages globaux, base des confirmations) sont **SOLO**.
- Ordre global : **moins risqué → plus risqué** (nettoyage/tests → realtime → extractions locales → consolidations partagées → transverses/sémantique).

### Dépendances explicites
- **P0** (backend) conditionne l'*effet* de la Vague 2 (pas sa sûreté).
- **T20** précède T21, T22, T23, T24.
- **T15** précède **T24** (même fichier).
- **T19** et **T25** précèdent **T28**.
- **T25** précède **T27** et **T28** (drill unifié d'abord).
