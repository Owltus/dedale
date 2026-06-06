# Plan — Vague 3 : QueryState & coquille FormDialog

## Contexte

Dernière vague du chantier DRY (effort L). L'audit a isolé les deux plus grosses
duplications restantes :

- **Échafaudage de liste asynchrone (D08)** : la « règle des 4 états »
  (`isPending → squelettes`, `isError → ErrorState`, `vide → EmptyState`,
  sinon `contenu`) est recopiée sur ~11 écrans liste + `documents-tab`, avec des
  variations (grille vs liste, simple vs double EmptyState, mono/multi-requêtes).
- **Coquille des form-dialogs (D06)** : ~13 `*-form-dialog.tsx` + dialogs
  d'action partagent la même coquille (Dialog + header + `<form>` + footer
  Annuler/Valider avec `pending`), recopiée à chaque fois.

Objectif : extraire ces deux briques en composants réutilisables et migrer les
usages **sans changer le comportement** (mêmes états, mêmes messages Zod, mêmes
mutations/invalidations, mêmes toasts, même reset à l'ouverture). On réutilise
les primitives des vagues 1-2 (TextField, SelectField, TextareaField, InfoNote,
NoSiteSelected, Dialog…).

Contraintes : Vite + React 19 + TanStack + Tailwind 4 + shadcn/ui ; tokens
sémantiques ; TS strict ; ESLint strict + Prettier (ne pas trier les classes à
la main) ; tout en français ; « le front présente, la base valide ».

---

## Décisions (tranchées)

- **QueryState = composant unique en render-prop** (pas de variantes
  Grid/List/Table). Signature : `<QueryState query={uneQuery} pending={…}
  empty={…}>{(data) => …}</QueryState>`. Il gère en interne les 3 états non-data
  (pending → le `pending` fourni ; error → `<ErrorState onRetry={refetch}/>` ;
  vide → le `empty` fourni si `data` est un tableau vide) et délègue le rendu des
  données via la render-prop. Le **conteneur/grille reste à la charge de
  l'appelant** (car il varie : `cardGrid`, liste, etc.).
- **Double EmptyState (recherche)** : le cas « aucun résultat de recherche »
  reste géré dans la render-prop de l'appelant (filtrage côté client) ; `empty`
  ne couvre que « aucune donnée du tout ».
- **CardSkeletons** : helper `common/card-skeletons.tsx`
  (`count`, `height`, `container`) pour les squelettes ; défaut `cardGrid.default`.
- **FormDialog = coquille VISUELLE pure** : Dialog + DialogHeader
  (titre/description) + `<form onSubmit>` + DialogFooter (Annuler + Valider avec
  `pending`). **L'appelant garde** son état (`useState` valeurs/erreurs), sa
  validation Zod (`safeParse`/`fieldErrors`), ses mutations/toasts, et son
  **comportement de reset inchangé** (la coquille ne gère pas l'état → aucun
  risque de régression sur le reset). Props : `open`, `onOpenChange`, `title`,
  `description?`, `onSubmit`, `submitLabel`, `pendingLabel?`, `pending`,
  `submitVariant?`, `cancelLabel?`, `contentClassName?`, `children`.
- **Pas de hook `useFormValues`** pour l'instant (éviter la sur-abstraction ; le
  `set` local de chaque dialog reste).
- **Périmètre QueryState** : les ~11 écrans liste à 4 états standard +
  `documents-tab`. **Exclus** (atypiques) : `registre` (table + onglets),
  `planning` (grille custom), `dashboard` (mini-listes `divide-y`). Le drill-down
  `localisations` (3 vues) et `utilisateurs` (liste + `enabled`) sont inclus s'ils
  rentrent proprement, sinon laissés tels quels.

## Angles à clarifier

- **API QueryState (divergence recon)** : un agent proposait des variantes
  spécialisées `QueryStateGrid/List/Table` ; je tranche pour **un seul composant
  render-prop** (plus simple, conteneur libre). À confirmer.
- **Reset des dialogs à l'ouverture (divergence recon)** : un agent a vu des
  parents forcer le remount via `key={open ? …}` (donc reset OK), un autre a noté
  l'absence de `key` (risque d'état rémanent). La coquille FormDialog **ne
  touchera pas** ce comportement (l'état reste chez l'appelant). À confirmer qu'on
  ne veut PAS profiter de la vague pour corriger un éventuel non-reset.
- **Profondeur du périmètre** : inclut-on `localisations` (drill-down ×3) et
  `utilisateurs` (liste non-grille + `enabled`) dans la migration QueryState, ou
  on se limite aux grilles de cartes simples ?
- **Hook `useFormValues`** : on s'en passe par défaut — OK, ou tu le veux pour
  aller au bout de la dédup ?

---

## Phases

| #   | Fichier                                                  | Phase                          | Dépend de | Priorité | Effort | Livrable                                                       | Critique |
| --- | ------------------------------------------------------- | ------------------------------ | --------- | -------- | ------ | ------------------------------------------------------------- | -------- |
| 1   | [1-query-state.md](./1-query-state.md)                  | Primitive QueryState + skeletons | —       | P0       | M      | `common/query-state.tsx`, `common/card-skeletons.tsx`         |          |
| 2   | [2-migration-listes.md](./2-migration-listes.md)        | Migration des écrans liste     | 1         | P1       | L      | ~11 écrans + documents-tab migrés vers QueryState             | ⚠        |
| 3   | [3-form-dialog.md](./3-form-dialog.md)                  | Coquille FormDialog            | —         | P0       | M      | `common/form-dialog.tsx`                                       |          |
| 4   | [4-migration-dialogs.md](./4-migration-dialogs.md)      | Migration des dialogs          | 3         | P1       | L      | ~13 form-dialogs + dialogs d'action migrés                    | ⚠        |
| 5   | [5-doc-conventions.md](./5-doc-conventions.md)          | Documentation des patterns     | 1,3       | P2       | S      | `docs/conventions/composants.md` mis à jour                   |          |
| 6   | [6-validation-globale.md](./6-validation-globale.md)    | Validation & revue             | toutes    | P0       | M      | tsc/lint/build verts, revue `/code-review`, commits par étape | ⚠        |

---

## Ordre d'exécution (sprints)

- **Sprint A — Socles** : étapes 1 (QueryState) et 3 (FormDialog), indépendantes.
- **Sprint B — Migrations** : étapes 2 et 4 (indépendantes l'une de l'autre).
  Commit par étape.
- **Sprint C — Recette** : étape 5 (doc) puis 6 (validation + audit).

---

## Architecture cible

```
src/components/common/
  query-state.tsx     <- 4 états d'une requête (render-prop, conteneur libre)
  card-skeletons.tsx  <- grille de N squelettes (count/height/container)
  form-dialog.tsx     <- coquille Dialog + header + form + footer (Annuler/Valider)
docs/conventions/
  composants.md       <- section « States & FormDialog » ajoutée
```

---

## Fichiers impactés (résumé)

| Couche      | Fichiers modifiés                                                      | Fichiers nouveaux                                            |
| ----------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| Primitives  | —                                                                     | `common/query-state.tsx`, `common/card-skeletons.tsx`, `common/form-dialog.tsx` |
| Listes      | ~11 routes `_app/*.tsx` + `common/documents-tab.tsx`                  | —                                                           |
| Dialogs     | ~13 `*-form-dialog.tsx` + dialogs d'action (motif, cloture, di-resolve, observation-lever, ot-create…) | —                          |
| Doc         | `docs/conventions/composants.md`                                      | —                                                           |
