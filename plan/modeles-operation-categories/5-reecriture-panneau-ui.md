# Étape 5 — Réécriture du panneau UI à parité de l'équipement

## Objectif

Réécrire `gammes-types-panel.tsx` en miroir de `modeles-equipements-panel.tsx` : navigation par
catégories (1 niveau) via `useBiblioTreeDrill`, cartes `ListRow` (`hideChevron`), CRUD
catégories (réutilise `CategoryFormDialog` + `useDeleteCategorie`), CRUD modèles DANS une
catégorie, sélecteur de périmètre (`ScopeSelect` interactif racine / verrouillé en descente),
bouton « Copier vers un site » (`ExporterVersSiteDialog` + `useCopierModeleOperation`), vue
détail = `OperationItemsEditor` (inchangé).

## Contexte

- Modèle de référence : `src/features/modeles-equipements/components/modeles-equipements-panel.tsx`
  (structure complète : `tabAddConfig`, `titleNode`, `scopeDisplay`, `ListRow` catégories +
  modèles, dialogs). À calquer section par section.
- Le slug d'onglet reste `'gammes-types'` (D5) → `useBiblioTreeDrill('gammes-types', operationCats)`.
- Composants réutilisés tels quels : `ListRow`, `ScopeSelect`, `TitleBreadcrumb`,
  `ExporterVersSiteDialog`, `useTabAddAction`/`useTabTitle`, `CategoryFormDialog`,
  `OperationItemsEditor`, `MiniatureThumb`/`useMiniatureUrls`.
- `gamme-type-form-dialog.tsx` : à faire évoluer pour recevoir une `categorie_id`
  (verrouillée à la création dans une catégorie, comme `modele-equipement-form-dialog`).

## Fichier(s) impacté(s)

- `src/features/modeles-operations/components/gammes-types-panel.tsx` — réécriture
- `src/features/modeles-operations/components/gamme-type-form-dialog.tsx` — ajout catégorie
- (réutilisés sans modif : `operation-items-editor.tsx`, `operation-item-form-dialog.tsx`,
  `CategoryFormDialog`)

## Travail à réaliser

### 1. `gamme-type-form-dialog.tsx` — champ catégorie

- Ajouter aux props : `categories: { id: string; nom: string }[]`, `lockedCategorieId?: string`.
- `initialValues` : `categorie_id: modele?.categorie_id ?? lockedCategorieId ?? ''`.
- À la création dans une catégorie (`lockedCategorieId` fourni) : champ catégorie **verrouillé**
  (pré-rempli, non modifiable), comme le form équipement minimal. À l'édition : `SelectField`
  catégorie modifiable (options = catégories `'operation'` du même périmètre).

### 2. `gammes-types-panel.tsx` — réécriture en miroir

Reprendre la structure de `modeles-equipements-panel.tsx` en substituant :

| Équipement                              | Opération                                  |
| --------------------------------------- | ------------------------------------------ |
| `modelesEquipementsQueries.pool()`      | `modelesOperationsQueries.pool()`          |
| `categoriesQueries.pool()` (scope eq.)  | `categoriesQueries.pool()` (scope `operation`) |
| `useBiblioTreeDrill('modeles-equipements', …)` | `useBiblioTreeDrill('gammes-types', operationCats)` |
| `ModeleEquipementFormDialog`            | `GammeTypeFormDialog` (+ categorie_id)     |
| `ModeleEquipementDetail` (vue feuille)  | `OperationItemsEditor` (vue feuille)       |
| `useCopierModeleEquipement`             | `useCopierModeleOperation`                 |
| suppression `useDeleteModeleEquipement` | `useDetacherEtSupprimerModeleOperation` (conserver le message de liens) |

Points à respecter :

- **Filtre catégories** (défaut A1 strict) :
  ```ts
  const operationCats = useMemo(
    () => (categoriesQuery.data ?? []).filter((c) => c.est_actif && c.scope === 'operation'),
    [categoriesQuery.data],
  )
  ```
- **Cartes catégories** : `ListRow` + `hideChevron`, badge Commun/Site, `onClick` descend
  (`goTo([...path, cat])`), actions Modifier/Supprimer (`CategoryFormDialog` / `setToDeleteCategorie`).
- **Cartes modèles** (dans la catégorie courante) : `ListRow` + `hideChevron`, badge
  Commun/Site, sous-titre = nb d'items (réutiliser le count, cf. `poolImport`/jointure),
  `onClick` ouvre le détail, actions « Copier vers un site » (si commun + `canExport`),
  Modifier, Supprimer.
- **Vue détail (feuille)** : rendre `OperationItemsEditor` pour le modèle ouvert (résolu via
  `leafSeg`, comme `openModele` côté équipement).
- **Barre de titre** : `tabAddConfig` selon la vue (racine → « Nouvelle catégorie » + scope
  interactif ; catégorie → « Nouveau modèle d'opération » + scope verrouillé ; détail → pas de
  « + », actions « Modifier »/« Copier » + scope verrouillé). `titleNode` = `TitleBreadcrumb`.
- **Suppression de modèle** : conserver la logique fine existante (RPC
  `detacher_et_supprimer_modele_operation` + message listant les gammes liées via
  `modelesOperationsQueries.liens`). NE PAS régresser ce comportement.
- **Droits** : `canManage = canManageMetier`, `canEntreprise = canManageAdmin` ;
  `canManageCat`/`canEditModele` calqués sur l'équipement.
- **Realtime** : `useRealtimeRefresh('modeles_operations', …)` + `useRealtimeRefresh('categories', …)`.

## Ordre d'exécution

1. Faire évoluer `gamme-type-form-dialog.tsx` (champ catégorie).
2. Réécrire `gammes-types-panel.tsx` en miroir de l'équipement.
3. Vérifier la vue détail (`OperationItemsEditor`) et la suppression fine.

## Critère de validation

- `npm run typecheck` + `npm run lint` verts.
- On crée une catégorie d'opération, on y crée un modèle, on l'ouvre (items éditables), on
  remonte via le fil d'Ariane.
- En commun : bouton « Copier vers un site » sur un modèle → copie visible sous le site (badge
  Site), avec ses items.
- Un technicien : voit le commun (lecture), crée/édite sur son site ; les options « Commun »
  lui sont gatées (la RLS reste l'arbitre).
- Les cartes sont des `ListRow` SANS chevron (cohérence avec Plan de maintenance + Modèles
  d'équipement).
