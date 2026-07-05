# AUDIT — Refactor front Dédale

> Photographie de l'état du code avant refactor. Périmètre : `src/` (hors `database.types.ts` et `routeTree.gen.ts`, générés). Objectif : classer chaque élément en **À CONSERVER**, **À CONSOLIDER**, **À REFACTORER**, et documenter le code mort.
>
> **Contrainte du chantier** : refactor **purement front, iso-fonctionnel**. On ne touche ni aux `.env`, ni à l'infra, ni au schéma SQL. La base porte toute la logique métier + la RLS.

---

## 0. Synthèse

Le socle est **déjà mûr** : la plupart des « objectifs » du refactor sont partiellement atteints.

- **Modales** : il n'existe **aucune modale « maison »** (pas d'overlay/portail ad hoc). Tout passe par `DialogShell` → `FormDialog` / `ConfirmDialog` / `ConfirmDeleteDialog`, eux-mêmes bâtis sur la primitive shadcn `ui/dialog`. Seuls **2 fichiers** importent `ui/dialog` directement. → L'essentiel du travail « migrer vers shadcn » est **fait**.
- **Formulaires** : `react-hook-form` + `zodResolver` + `FormDialog` + `useSubmitDialog` sont le patron partout… **sauf** un îlot legacy (`profil.tsx`, `utilisateur-detail.tsx`, sous-système « champs dynamiques »).
- **Realtime** : un vrai hook générique existe déjà (`useRealtimeRefresh`, canal partagé par table, refcompté, dédup par hash). Le problème est la **couverture inégale** (6 listes sans live-refresh).
- **Briques réutilisables** : couche `common/` + `hooks/` riche et adoptée (`ListRow`, `QueryState`, `SlugDetailRoute`, `useEntityDialog`, `useConfirmDelete`, `CataloguePanel`…).

Le refactor est donc surtout un travail de **consolidation** (fermer les écarts, supprimer les doublons résiduels) et de **découpage** de 4-5 gros fichiers, pas une reconstruction.

| Catégorie | Volume indicatif |
| --- | --- |
| À CONSERVER | Le socle : ~80 % des `common/`, `hooks/`, `lib/`, patrons de données/formulaires/modales |
| À CONSOLIDER | 2 générations de champs · realtime partiel · 2 panneaux catalogue dupliqués · confirmations d'action recopiées · `ListRow.actions` legacy |
| À REFACTORER | `gammes-biblio-panel` (912 l.) · `ot-detail` (819) · `operation-row` (599) · `utilisateur-detail` (642) · `profil` (forms) · absence de tests sur le cœur navigation/champs |
| CODE MORT | `use-biblio-drill.ts` · trio de champs legacy `switch/description/textarea-field` · stubs `registre`/`releves` |

---

## 1. À CONSERVER

Bien construit, cohérent, adopté — **ne pas toucher** (au plus, réutiliser davantage).

### Infrastructure (`src/lib`, `src/auth`, routes racines)

| Élément | Pourquoi le garder |
| --- | --- |
| `lib/supabase.ts` | Singleton typé minimal, garde-fou env clair. |
| `lib/permissions.ts` (+ `.test.ts`) | Miroir RLS purement UI, **testé**. Prédicats par rôle centralisés. |
| `lib/nav.ts` (+ `.test.ts`), `lib/nav-guard.ts` | Table de visibilité unique (sidebar + gardes), **testée**. Fail-open assumé (RLS = sécurité réelle). |
| `lib/date.ts` (+ `.test.ts`) | Dates locales / semaines ISO / formats FR, **testé**, réutilisé partout. |
| `lib/form.ts` | **Point unique** de traduction erreurs Zod/SQLSTATE → FR. Consommé par les hooks de soumission/suppression. Pièce la plus solide de la gestion d'erreurs. |
| `lib/referentiel.ts` | Factory générique des queries « référentiel » (petites tables). Normalise les clés. |
| `lib/site-context.tsx` | Contexte du site actif (persistance localStorage, tri déterministe). |
| `auth.tsx` | Session + purge cache au `SIGNED_OUT`. Simple et correct. |
| `routes/__root.tsx`, `routes/_app.tsx` | Garde d'auth factorisée, préchargement rôle+sites, aiguillage de layout (NoSite/Demandeur/Default), sync d'accès à chaud. Bien pensé (a11y : focus main, skip-link). |

### Hooks socle (`src/hooks`)

`useRealtimeRefresh` (canal partagé/refcompté), `useEntityDialog` (état create/edit + clé de remontage), `useConfirmDelete` (état + toast + câblage dialog), `useSubmitDialog` (plomberie RHF → toast/fermeture), `useCurrentRole`, `use-tree-drill` (cœur générique de descente d'arbre), `use-catalogue-drill` (socle explorateur), `use-file-drop`/`use-upload-drop`, `use-media-query`, `use-long-press`, `use-save-shortcut`.

### Données — patron homogène

Chaque feature expose une **factory `xxxQueries`** : `all: () => ['feature'] as const`, puis clés dérivées par spread `[...all(), 'list', siteId]`. Écritures via hooks `useCreateX/useUpdateX/useDeleteX` avec `throwOnError()` + `abortSignal()` + `invalidateQueries`. **Convention realtime D4** respectée : la clé est rangée sous la table réellement lue (ex. `gammesQueries.sousCategories` sous `categories`). `OT_QUERY_KEYS` (agrège `ordres_travail` + `planning`) est **le modèle** de centralisation de clés multi-features.

### Composants partagés — les primitives adoptées

- **Modales** : `dialog-shell.tsx` (coquille 3 zones), `form-dialog.tsx` (29 usages), `confirm-dialog.tsx`, `confirm-delete-dialog.tsx` (impact-aware, 14 usages).
- **Listes/pages** : `list-row.tsx` (22), `list-filter-bar.tsx` (8), `query-state.tsx` (24), `page-header.tsx` (25), `page-container.tsx` (27), `slug-detail-route.tsx` (5), `detail-header-card.tsx` (7), `status-stepper.tsx`, `status-badge.tsx` (19), `empty-state.tsx` (34), `documents-liste.tsx` / `documents-tab.tsx` (mutualisation upload/aperçu/téléchargement).
- **Formulaires** : `common/fields/*` (génération RHF `control`/`name`, 25 fichiers / ~63 imports) + `ui/form.tsx`.
- **Catalogue** : `catalogue-panel.tsx` — **ossature générique déjà factorisée**, consommée proprement par `modeles-equipements` et `modeles-operations` (config pure).
- **Charts** : `common/charts/*` (`chart-legend` socle + `donut`/`barres-empilees`/`sunburst`), tous utilisés par le dashboard.
- Primitives `ui/*` = registre shadcn/ui standard (button, input, dialog, dropdown-menu, context-menu, select-dropdown, form, card, badge, tooltip, sidebar, sonner…).

---

## 2. À CONSOLIDER

Fonctionne, mais **dupliqué ou dispersé** — à factoriser sans changer le comportement.

### C1 — Deux générations de champs de formulaire
`common/fields/*` (RHF, `control`/`name`, erreurs via `FormMessage`/Zod, select Radix) **vs** `common/*-field.tsx` (legacy `value`/`onChange`, prop `error` manuelle, `<select>` natif). Redondance 1-pour-1 des noms (`text-field`, `select-field`, `number-field`, `checkbox-field`…).
Legacy **encore vivants** : `text-field`, `select-field`, `number-field`, `checkbox-field` — ancrés dans le sous-système « champs dynamiques » (`champ-valeur-input.tsx`, `champ-form-dialog.tsx`, en `useState` local) et dans `utilisateur-detail.tsx`, `profil.tsx`, `exporter-vers-site-dialog.tsx`, `emplacement-select.tsx`, `local-equipement-fields.tsx`.
→ **Cible** : migrer les consommateurs qui *devraient* être RHF (profil, utilisateur-detail) vers `fields/`, puis regrouper/renommer les champs contrôlés légitimes (widgets non-RHF) pour supprimer la collision de noms, et retirer le legacy inutile.

### C2 — Couverture Realtime inégale (objectif #3)
Le hook existe et marche. Manquent les abonnements sur : **listes Sites, Utilisateurs, Investissements, Travaux, Documents** ; **explorer Localisations** (seul explorer sans live-refresh) ; incohérences ponctuelles : dans `prestataire-detail`, l'abonnement `ordres_travail` est posé dans le **panneau Gammes** au lieu du panneau OT ; `gamme-operations-section` (ops d'une gamme de site) ne s'abonne pas à `operations` alors que la version biblio le fait.
> ⚠️ **Prérequis backend** : un abonnement Realtime n'est effectif que si la table appartient à la publication `supabase_realtime`. Ajouter le hook côté front est **inoffensif et iso-fonctionnel** même si la table n'est pas publiée (l'abonnement reste inerte, aucune erreur). L'activation de la publication est une étape **backend hors périmètre** de ce refactor — à confirmer avec le PO table par table.

### C3 — `gammes-biblio-panel.tsx` (912 l.) réimplémente `CataloguePanel`
~80 % de recouvrement 1-pour-1 avec `catalogue-panel.tsx` (résolution `openX`/`goToX` via `segOfUnique`, `childCategories`, `tabAddConfig`, CRUD catégorie, `ScopeSelect`, `ExporterVersSiteDialog`). Le fork n'est justifié que par : `GammeCard` (au lieu de `ListRow`), `CopierContenuDialog`, `pathForGamme`, détail à deux sections.
→ **Cible** : généraliser `CataloguePanel` (points d'extension `renderCard`, `itemPath`, action « copier conteneur ») et **fondre** `gammes-biblio-panel` dedans (~600 l. supprimables).

### C4 — `gammes-explorer` ↔ `equipements-explorer` (~70 % communs)
Même structure (header par profondeur, dialogs catégorie, `canManageCat`, états vides, `makeVirtual`/`realCats`) via `useCatalogueDrill`. `gammes-explorer` porte en plus la logique de badges de statut agrégés.
→ **Cible** : shell commun `<CatalogueExplorer>` paramétré + extraction `useGammeBadges`.

### C5 — Adaptateurs de drill quasi identiques
`use-gammes-drill.ts`, `use-equipements-drill.ts`, `use-biblio-tree-drill.ts` (~40 l. chacun) ne diffèrent que par la chaîne de route et un `.slice(1)`.
→ **Cible** : un seul hook paramétré par `getRouteApi(path)`.

### C6 — Double implémentation de la resync d'URL
`use-leaf-resync.ts` (`useEffect`) **et** la resync inline de `use-catalogue-drill.ts` (`useLayoutEffect`, l.202-218) refont le même invariant (« réécrire l'URL de la feuille au renommage »). Timings divergents → geste UI potentiellement différent selon l'écran.
→ **Cible** : unifier (option `layout` sur `useLeafResync`).

### C7 — Confirmations d'action de statut recopiées
Le micro-patron `ConfirmDialog` + `useState` (ouvrir/mutate/toast/fermer) est réécrit quasi à l'identique dans `investissement-detail` (Refuser/Réactiver), `travaux-detail` (Annuler/Réactiver), `di-detail` (prendre en charge/clôturer/rouvrir), `utilisateur-detail` (activer/anonymiser).
→ **Cible** : hook `useConfirmAction` symétrique de `useConfirmDelete`.

### C8 — Suppression réimplémentée à la main dans `di-detail`
Les pages **liste** suppriment uniformément via `useConfirmDelete` ; `di-detail.tsx` refait `useState(deleteOpen)` + `mutate` + toast + navigate.
→ **Cible** : réutiliser `useConfirmDelete`.

### C9 — Blocs profil/e-mail/mot de passe dupliqués
`profil.tsx` et `utilisateur-detail.tsx` partagent le même `profileSchema`, les mêmes blocs e-mail et réinitialisation de mot de passe, en double.
→ **Cible** : composant(s) commun(s) après migration RHF.

### C10 — `ListRow.actions` (legacy) → `menuActions`
`ListRow` documente `actions` (boutons au survol) comme mode ancien remplacé par `menuActions` (menu contextuel + kebab). Migration partielle.
→ **Cible** : basculer les pages restantes.

### C11 — Trois styles de dropdown
`ui/select` (`<select>` natif nu), `common/select-menu` (`<select>` natif à chevron custom) et `ui/select-dropdown` (Radix). Cohabitent.
→ **Cible** : converger vers Radix `select-dropdown` là où c'est pertinent (laisser le natif où il est volontaire, ex. mobile).

### C12 — Deux notions de « scope » homonymes
Site actif (`lib/site-context`) **vs** scope Bibliothèque (`hooks/use-scope` + `scope-provider`). Vocabulaire partiellement partagé (`scope`, `siteId`), deux contextes distincts, le scope biblio ne suit pas dynamiquement un changement de site actif.
→ **Cible** : documenter/renommer pour lever l'ambiguïté (pas de changement de comportement).

### C13 — Homonymes de fichiers prêtant à confusion
`common/operation-row.tsx` **vs** `features/ordres-travail/components/operation-row.tsx` (rôles proches, socles différents) ; `ui/date-field.tsx` **vs** `common/fields/date-field.tsx` (l'un enveloppe l'autre).
→ **Cible** : renommer pour désambiguïser.

---

## 3. À REFACTORER

Mal structuré ou fragile — problème + solution visée.

### R1 — `gammes-biblio-panel.tsx` (912 l.)
**Problème** : plus gros fichier écrit à la main, multi-responsabilités (drill + CRUD catégories + CRUD gammes + export + realtime), fork de `CataloguePanel`.
**Solution** : cf. C3 (fondre dans `CataloguePanel` généralisé). À défaut, extraire le builder `tabAddConfig` et le bloc CRUD catégorie.

### R2 — `ot-detail.tsx` (819 l.)
**Problème** : 3 responsabilités imbriquées — moteur d'édition des opérations (`edits`, `dirtyOps`, `saveAllOps`, `useBlocker`, ~200 l.), transitions de statut, et `headerActions` conditionnels (~100 l.).
**Solution** : extraire `useOperationsEditor(otId)`, `<OtDetailActions>`, et un module de transitions ; déplacer le calcul `releve` vers `releves.ts`.

### R3 — `operation-row.tsx` (599 l.)
**Problème** : composant local `ChampNombreUnite`, panneau « changement de compteur » (~100 l. JSX) et prédicats métier (`estMesureExecution`/`estCompteur`…) tous inline.
**Solution** : extraire `ChampNombreUnite` et le panneau compteur en sous-composants, sortir les prédicats vers un module proche de `schemas.ts`.

### R4 — `utilisateur-detail.tsx` (642 l.)
**Problème** : fichier monolithique (identité/sites/e-mail/sécurité/admin), formulaires **hors patron** (`useState` + `safeParse` + ancien `TextField`), multiples `ConfirmDialog` en `useState`.
**Solution** : migrer les formulaires vers RHF + `fields/` (C1), factoriser les confirmations via `useConfirmAction` (C7), découper en sous-composants (Identité/Sites/Administration), mutualiser les blocs e-mail/mdp avec `profil` (C9).

### R5 — `profil.tsx` (312 l.)
**Problème** : `EmailBlock`/`ProfilForm`/`SecurityCard` en `useState` + `safeParse` + ancien `TextField` + `useMutation` inline. Forte duplication avec R4.
**Solution** : migrer vers RHF + `fields/`, puis mutualiser (C9).

### R6 — Absence de tests sur le cœur fragile
**Problème** : `slug.ts` (`segOfUnique` — symétrie génération/résolution, cœur des 6 explorateurs), `champs.ts` (`prepareChamps`, 6 règles + garde-fou), `form.ts` (mapping SQLSTATE), `scope.ts` (`resolvePorteeScope`) ne sont **pas testés**. Une régression sur `segOfUnique` casserait silencieusement toute la navigation par URL.
**Solution** : filet de tests unitaires (Vitest déjà en place).

### R7 — `miniatures-panel.tsx` (649 l.)
**Problème** : actions (ZIP/download) + rendu de tuile + logique de sélection dans un seul fichier.
**Solution** : extraire les actions et la tuile en composants.

---

## 4. Code mort / orphelins (à supprimer)

| Élément | Constat |
| --- | --- |
| `src/hooks/use-biblio-drill.ts` | **Orphelin** — aucun consommateur (seule occurrence = mention en commentaire dans `use-biblio-tree-drill.ts`). ~117 l. |
| `src/components/common/switch-field.tsx` (legacy) | **0 importateur**. |
| `src/components/common/description-field.tsx` (legacy) | **0 importateur** (le `DescriptionField` vivant est `fields/description-field.tsx`). |
| `src/components/common/textarea-field.tsx` (legacy) | Importé **uniquement** par le `description-field` legacy ci-dessus → chaîne morte. |
| `routes/_app/registre.tsx`, `routes/_app/releves.tsx` | **Stubs** « Page en travaux » (`PageHeader` + `EmptyState`), aucune feature branchée. **Placeholders assumés** — à laisser tant que les pages sont prévues, mais à documenter comme non implémentées (ne pas confondre avec du réel). |

> ⚠️ **Méthode** : le legacy et le breadcrumb utilisent des imports **relatifs** (`./x-field`, `./breadcrumb`). Une passe de détection par chemin absolu seul (`@/components/common/…`) donne de **faux orphelins** (`common/breadcrumb.tsx` et `common/number-field.tsx` sont en réalité **vivants** via `./`). Toute suppression doit vérifier les deux formes d'import.

---

## 5. Points transverses mineurs

- **Imports relatifs remontants** (`../`) : ~175 occurrences. La plupart sont **intra-feature** (légitimes). À cibler : uniquement les imports **inter-couches** qui devraient passer par l'alias `@/`.
- **`any` / `as any`** : ~37 occurrences hors `database.types`. À réduire (props typées strictement, objectif #1).
- **Style de Provider** : `auth.tsx` utilise `<AuthContext.Provider>` (ancien) là où `site-context.tsx` utilise `<SiteContext value=…>` (React 19). Harmoniser.
- **`ui/sheet`** (quasi-mort, sidebar only), **`ui/tabs`** (1 usage), **`ui/popover`** (1 usage) : primitives sous-utilisées. `Sheet` est un candidat naturel pour les **grands formulaires** (panneau latéral) — voir plan (optionnel).
- **`AlertDialog` absent** : toutes les confirmations passent par `Dialog`. Ajouter la primitive `ui/alert-dialog` et y faire porter `ConfirmDialog`/`ConfirmDeleteDialog` donnerait la sémantique ARIA `role="alertdialog"` « gratuitement » (2 fichiers à migrer, 26 sites bénéficiaires indirects).
