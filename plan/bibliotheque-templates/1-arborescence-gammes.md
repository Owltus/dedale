# Étape 1 — Onglet « Gammes » : arborescence des gammes-templates

## Objectif

Exposer dans la Bibliothèque les **gammes-templates communes** (`gammes.site_id IS NULL`),
rangées dans un **arbre catégorie / sous-catégorie** (`gammes.categorie_id`, scope `gamme`),
avec CRUD complet (admin/manager). C'est le gros manque : aujourd'hui ni les gammes communes
ni l'arbre de catégories `gamme` ne sont visibles côté front.

## Contexte (acquis de l'exploration)

- Une gamme `site_id IS NULL` est un **template inerte** (ne génère jamais d'OT). Source de
  vérité backend : `gammes` (l. 2748-2782), commun/site déjà géré.
- L'« arborescence » = `categories` de `scope = 'gamme'` (ou `mixte`), hiérarchie `parent_id`.
- Une gamme-template contient : ses **opérations spécifiques** (`operations`, FK `gamme_id`)
  - ses **modèles d'opération liés** (`gamme_modeles` — traité en étape 2).
- Le front gère déjà les gammes **de site** dans `src/routes/_app/gammes.tsx` +
  `src/features/gammes/` (queries filtrées `.eq('site_id', siteId)`, formulaires, éditeur
  d'opérations). On **réutilise** ces briques.

## Fichier(s) impacté(s)

- `src/features/gammes/queries.ts` — ajouter une query **commun** (`site_id IS NULL`) + jointure `categories`.
- `src/features/gammes/mutations.ts` — autoriser la création/édition au scope commun (`site_id: null`).
- `src/features/gammes/components/gamme-form-dialog.tsx` — ajouter le champ **catégorie** (scope `gamme`) + portée commun/site verrouillable.
- `src/features/categories/` — réutiliser `category-tree.tsx` + `category-form-dialog.tsx` en mode **scope `gamme`**.
- **NOUVEAU** `src/features/gammes/components/gammes-biblio-panel.tsx` — le panneau Biblio (arbre catégories `gamme` → gammes-templates), calqué sur `modeles-equipements-panel.tsx` (drill-down + `ScopeSelect` + `useTabAddAction`).
- `src/routes/_app/bibliotheque.tsx` — remplacer/renommer l'onglet : ajouter l'onglet **« Gammes »** (`GammesBiblioPanel`).

## Travail à réaliser

### 1. Query des gammes-templates communes

Dans `gammes/queries.ts`, ajouter `gammesQueries.biblioPool()` : `select` des gammes
accessibles avec jointure `categories(id, nom, parent_id, scope)`, **sans** filtre `site_id`
(la RLS arbitre), `.is('deleted_at', null)`. Renvoie commun + sites pour le `ScopeSelect`.

### 2. Panneau drill-down (calque équipement)

`gammes-biblio-panel.tsx` : racine = catégories `scope ∈ {gamme, mixte}` actives, en **arbre
catégorie/sous-catégorie** (réutiliser `category-tree`). Clic sur une catégorie → liste des
gammes-templates de cette catégorie. Le `+` (mutualisé via `useTabAddAction`) adopte le
périmètre du `ScopeSelect`, désactivé hors droit (même patron que les autres onglets).

### 3. CRUD gamme-template

- **Catégorie `gamme`** : réutiliser `category-form-dialog` avec `preset={{ scope: 'gamme' }}`
  - `lockedScope` selon le périmètre. Hiérarchie autorisée (catégorie ↔ sous-catégorie).
- **Gamme-template** : `gamme-form-dialog` enrichi d'un sélecteur **catégorie** (scope `gamme`)
  et créé en commun (`site_id NULL`) ou site selon le périmètre. Champs existants conservés
  (nom, nature, périodicité, prestataire, description).
- **Opérations spécifiques** : réutiliser l'éditeur `operation-form-dialog` (`operations`,
  FK `gamme_id`) dans le détail de la gamme-template.

### 4. Onglet Bibliothèque

Dans `bibliotheque.tsx`, déclarer l'onglet `gammes` → `<GammesBiblioPanel />`. (L'onglet actuel
`Modèles d'opérations` reste tel quel pour l'instant ; il sera complété en étape 2.)

## Ordre d'exécution

1. Query commun + types. 2. Form catégorie `gamme` + form gamme-template (catégorie). 3. Panneau
   drill-down. 4. Branchement onglet. 5. Mutations commun.

## Critère de validation

- En admin/manager : l'onglet « Gammes » affiche un arbre de catégories `gamme` ; on crée une
  catégorie, une sous-catégorie, une gamme-template dedans, on lui ajoute une opération.
- En technicien : lecture du commun OK ; création bloquée au commun (RLS), possible sur ses sites.
- `npm run typecheck` · `npm run lint` · `npm run build` verts.

## Contrôle (étape critique — >5 fichiers, lecture/écriture sensible)

- Vérifier que **rien n'écrit `site_id` non-NULL par erreur** sur une gamme-template commune.
- Vérifier le **trigger `check_categorie_parent_scope`** : une sous-catégorie sous un parent
  commun reste cohérente (pas d'erreur 42501 inattendue).
- Confirmer qu'une gamme-template commune **n'apparaît pas** comme source d'OT (elle est inerte).
