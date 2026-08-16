# Catalogue des briques réutilisables

> Référence chargée à la demande depuis `SKILL.md`. **Chercher ici AVANT de créer un composant.**
>
> La colonne **Usages** est le nombre de fichiers qui importent réellement la brique (recompté le 2026-08-16 après le chantier de remise en ordre). Elle n'est pas décorative : elle applique la règle **« une brique à un seul consommateur n'est pas une brique »** — soit on la généralise, soit on la retire du catalogue. Un `1*` marque une brique **structurellement** mono (un cadran = un graphe, un explorateur = un drill) : légitime, ne pas la signaler.
>
> Mettre cette colonne à jour à chaque chantier qui ajoute ou retire un consommateur.

## Coquille et en-tête

| Brique                      | Rôle                                                                                                                                                                                                                                                                                                | Usages      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `PageContainer`             | Racine de **toute** page. Défaut : 1er enfant = en-tête FIXE, le reste défile. **Piège** : avec un enfant UNIQUE, tout part dans la zone défilante, en-tête compris → pour une colonne centrée, utiliser `bodyMaxWidth`, jamais un `div` enveloppant. `fill` = l'enfant gère son propre défilement. | 30          |
| `FillHeader` / `ScrollBody` | Les deux briques du mode `fill`, exportées par `page-container.tsx`. **Source unique** des classes de gouttières — plus AUCUNE recopie dans `src/`. Acceptent les props d'un `div` (`role`, `id`, `aria-*`) : une brique qu'on ne peut pas étendre est une brique qu'on contourne.                  | 6 / 5       |
| `PageHeader`                | En-tête **UNIQUE** d'une page : `title` / `titleBadges` / `description` / `action` / `breadcrumb` / `onBack`. Espace ses actions en `gap-1` : lui passer un fragment nu, jamais un conteneur intermédiaire.                                                                                         | 29          |
| **`SiteScopedRoute`**       | **Garde de site + rôle + permission**, en render-prop : `{ siteId, role, canManage }` garantis aux enfants. Consomme le `PAGE_META` de la feature. À poser sur la route liste **ET** détail, avant toute query. N'impose pas de `PageContainer`.                                                    | 14          |
| **`PAGE_META`**             | `features/<x>/page-meta.ts` : `titre` / `description` / `hint` / `icone`. **Source unique de l'identité d'une page** — consommée par la liste, le détail, la garde et le `PageHeader`. Sans elle, la description était saisie deux fois et divergeait sur 5 pages sur 6.                            | 11 features |

## États de données

| Brique            | Rôle                                                                                                       | Usages |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------ |
| `QueryState`      | Les 4 états (chargement / erreur+retry / vide / données typées). **Par défaut sur tout écran de données.** | 24     |
| `EmptyState`      | État vide. Formule constante : « Aucun X » + « Crée un premier X… » + bouton conditionné au rôle.          | 37     |
| `ErrorState`      | Erreur avec bouton Réessayer.                                                                              | 11     |
| `NoSearchResults` | 5ᵉ cas, hors `QueryState` : liste filtrée sans résultat.                                                   | 10     |
| `NoSiteSelected`  | Garde de site, **avant toute query**.                                                                      | 14     |

## Listes

| Brique             | Rôle                                                                                                                                                                                                                                                                                             | Usages |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `ListRow`          | Ligne générique : `media` / `title` / `subtitle` / `badges` / `meta` / `mobileMeta` / `actions` / `menuActions` / `onClick` / `size`. Table de hauteurs `MEDIA_HEIGHT` : `xs` h-11, `sm` h-14, `md` h-20, `lg` h-24. Sans `onClick`, la ligne n'a ni cible focusable ni retour visuel au survol. | 23     |
| `RowMediaIcon`     | Icône d'une entité **sans** image. Passer le **composant** : `icon={HardHat}`. Taille figée `size-10`.                                                                                                                                                                                           | 9      |
| `MiniatureThumb`   | Entité **avec** image, en `media` de `ListRow`. `@/features/miniatures/components/`                                                                                                                                                                                                              | —      |
| `ListRowSkeletons` | Squelettes de liste. **Passer le même `size` que les lignes réelles** (`xs`/`fine`/`sm`/`md`/`lg`) : les hauteurs viennent de `MEDIA_HEIGHT`, la table exportée par `ListRow` — une seule source, donc aucun saut de mise en page possible. Défaut : `md`, 4 lignes.                             | 23     |
| `CardSkeletons`    | Squelettes de **grille de cartes** uniquement. ⚠ **2 consommateurs** : à généraliser ou à retirer (règle D4). Toute liste rendue en `ListRow` prend `ListRowSkeletons`.                                                                                                                          | 2      |
| `DetailHeaderCard` | Carte d'en-tête d'une fiche : vignette `h-20` + grille d'infos. `fields: ({label, value} \| null)[]` — un `null` = cellule vide qui préserve l'alignement. Marge et taille d'icône portées **par la brique**.                                                                                    | 7      |
| `DocumentsListe`   | Pièces jointes : rangée + aperçu + menu Télécharger/Modifier/Détacher/Supprimer + confirmations. Auto-suffisante (porte `useConfirmDelete` et ses toasts).                                                                                                                                       | 3      |
| `OperationRow`     | Ligne d'opération d'un OT.                                                                                                                                                                                                                                                                       | —      |

## Recherche et périmètre

| Brique                                          | Rôle                                                                                                                                                                                                                                                                                                                                      | Usages      |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `ListPageBody`                                  | **Corps d'une page liste** : barre + « aucun résultat » + `listStack`. Volontairement restreinte — ni `PageContainer`, ni `PageHeader`, ni `QueryState`, qui restent visibles dans la page où ils portent des variations légitimes.                                                                                                       | 7           |
| `ListFilterBar`                                 | **Source UNIQUE** de la barre d'une page liste : recherche + filtre **Radix**, pleine largeur. `filterValue` omis → recherche seule. Sentinelles `FILTRE_TOUS` / `FILTRE_NON_TERMINES`, prédicats `matchStatutFilter` / `matchTypeFilter`, fabriques `statutFilterOptions` / `typeFilterOptions`. Ne jamais remonter un `SearchInput` nu. | 8           |
| `SearchInput`                                   | Champ de recherche seul — **uniquement hors page liste** (dans un dialog, un panneau).                                                                                                                                                                                                                                                    | 5           |
| `ScopeSelect` · `ScopeProvider` · `ScopeBadges` | Périmètre Commun/site de la Bibliothèque.                                                                                                                                                                                                                                                                                                 | 4 / 1\* / 5 |

## Onglets et sections

| Brique                                      | Rôle                                                                                                                                                                                                                                                                  | Usages |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `DetailTabsShell`                           | Coquille « fiche à onglets » : en-tête fixe (`header` + `headerCard`) + `SubTabs` segmentée + zone défilante. **Les 3 fiches à onglets passent par elle** (gamme, OT, prestataire). Cas particuliers déjà couverts : `overlay` (surcouche de dépôt), `bodyClassName`. | 3      |
| `SubTabs`                                   | Sous-onglets **dans** une page. Variante `segmented` (pilules sur `bg-muted`) ou soulignée.                                                                                                                                                                           | 3      |
| `Tabs` + `useTabAddAction` / `useTabHeader` | Navigation principale d'une page à onglets (Bibliothèque).                                                                                                                                                                                                            | 1\*    |
| `Section` / `SectionHeader`                 | En-tête de section réutilisable (`h3` icône + titre + action).                                                                                                                                                                                                        | —      |
| `InfoNote`                                  | Encart d'information ou d'avertissement.                                                                                                                                                                                                                              | —      |

## Dialogs

Voir le skill **`modale`** pour l'arbre de décision complet et le câblage.

| Brique                           | Rôle                                                                                                                                                                                                         | Usages |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `DialogShell`                    | Coquille « 3 zones » (`max-h-85vh`). **Base commune de TOUTES les modales** : aucun `DialogContent` ne doit être monté hors d'elle. Variantes `size` (sm→full), `padded`, `headerAction`, `headerSeparator`. | 10     |
| `FormDialog`                     | Tout dialog de formulaire, bâti sur `DialogShell`. Son `<form>` fait déjà `preventDefault` + `stopPropagation` : ne pas re-wrapper.                                                                          | 33     |
| `ConfirmDeleteDialog`            | Suppression définitive, impact-aware : `warning` / `impacts` / `blocked` / `confirmPhrase`.                                                                                                                  | 16     |
| `ConfirmDialog`                  | Action ponctuelle **réversible** uniquement.                                                                                                                                                                 | 14     |
| `MotifDialog`                    | Texte obligatoire avant action (clôture avec compte-rendu, refus, annulation).                                                                                                                               | —      |
| `ChecklistDialog` (+ `CheckRow`) | Multi-sélection cochable avec recherche. `CheckRow` est réutilisable hors de sa coquille — l'utiliser plutôt que de recomposer un `<label>` + `Checkbox`, qui perd le lien `htmlFor`/`useId`.                | —      |
| `ExporterVersSiteDialog`         | Export d'un contenu commun vers un site.                                                                                                                                                                     | —      |
| `ConfirmDeleteCategorieDialog`   | Suppression de catégorie (blocage « non vide »). `@/features/categories/components/`                                                                                                                         | —      |

## Champs de formulaire — `@/components/common/fields/`

Tous branchés sur `control={form.control}` + `name="…"`, erreur via `FormMessage`. **Jamais** `value`/`onChange`/`error`.

| Brique                                          | Usages   | Note                                                                                                     |
| ----------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `SelectField`                                   | 14       | Select **Radix**. **Jamais d'item à `value=""`** (Radix y voit « pas de valeur ») → prop `optionAucune`. |
| `TextField`                                     | 13       |                                                                                                          |
| `IdentiteFields`                                | 11       | nom + description + miniature                                                                            |
| `DateField`                                     | 8        |                                                                                                          |
| `RadioField`                                    | 7        |                                                                                                          |
| `DescriptionField`                              | 6        |                                                                                                          |
| `TextareaField`                                 | 5        |                                                                                                          |
| `PorteeField`                                   | 3        | Portée Commun/site                                                                                       |
| `CheckboxField` · `NumberField` · `SwitchField` | 1 chacun | `SwitchField` pour un choix **binaire** ; un ENUM reste un `SelectField`.                                |

> **Deux familles de champs, un seul critère.** `common/fields/*` (ci-dessus) = **react-hook-form** : `control` + `name`, validation Zod, `FormMessage`. `common/standalone-fields.tsx` = **état local** : `value` + `onChange`, pour un champ dont le type n'est connu qu'à l'exécution, une cascade, ou un dialog qui gère son propre état. Choisir selon **qui porte l'état**. (Une génération 1 bâtie sur les primitives natives a existé à la racine de `common/` ; elle a été supprimée — ne pas la recréer.)

### Champs à état local — `common/standalone-fields.tsx`

`StandaloneSelect` · `StandaloneText` · `StandaloneCheckbox` — API `value` / `onChange`, sur les mêmes primitives Radix. **4 consommateurs.**

Le critère de choix est le porteur de l'état, jamais l'habitude : formulaire react-hook-form → `fields/*` ; champ dont le type n'est connu qu'à l'exécution, cascade, dialog à état local → `Standalone*`.

Champs à API impérative propres à un domaine, à ponter via `useWatch` + `form.setValue` : `LocalEquipementFields` (cascade localisation → équipement), `ChampValeurInput` / `ChampsListEditor` (caractéristiques dynamiques), `MiniatureField` (upload de vignette).

## Statut et documents

| Brique                               | Rôle                                                                                                                                               | Usages  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `StatusBadge` + `StatusTone`         | **Source unique** des tonalités d'état. `destructive` **teinté** = état critique ; `variant="destructive"` **solide** = action destructrice seule. | 27      |
| `StatusStepper` + `construireEtapes` | Frise d'un cycle. États calculés **en amont** dans `features/<x>/etat.ts`.                                                                         | 3       |
| `ProgressBar`                        | Barre neutre `value` 0..1 + `tone`. Aucune logique : l'appelant fournit valeur et tonalité.                                                        | 1\*     |
| `DocumentsTab`                       | Pièces jointes (doctrine d'upload en 3 étapes encapsulée). `canAttach?` pour verrouiller l'ajout.                                                  | 5       |
| `FileDropField` / `FileDropOverlay`  | Dépôt dans un dialog / invite en pleine page.                                                                                                      | 1\* / 5 |
| `iconeFormat` / `PdfFileIcon`        | Icône selon le **format MIME**, pas le type métier.                                                                                                | 1\*     |

## Carte riche par entité

Quand une entité ne tient **pas** sur une `ListRow` (statut détaillé, barre de progression, sous-blocs), composer une carte dédiée sur `Card`/`CardContent` — et **centraliser toute la logique dans `features/<x>/etat.ts`** : la carte ne calcule rien.

Référence : `ContratCard` (`features/prestataires/components/contrat-card.tsx`).

## Graphiques — `common/charts/` (ADR 0005)

`Donut` · `BarresEmpilees` · `Sunburst` (3 niveaux, `opacite`/`hachures`/`blink`) — 1\* chacun, un cadran par graphe. Contrat partagé : `ChartSegment`, `toneToken` (tonalité → variable CSS, **jamais** de couleur en dur).

Navigation temporelle synchronisée : `useFenetreTemporelle` monté **une seule fois** par l'orchestrateur, `useColonnesAuto` pour le nombre de colonnes responsive.

## Actions et layout

`TooltipIconButton` (action icône seule + tooltip/aria ; `variant="outline"` en barre de titre) — 28 usages.
`AppSidebar` / `SidebarContent` / `SiteSwitcher` / `UserMenu` / `TopBar` / `MobileHeader` — déjà câblés dans `_app`, visibilité via `canSeeNav`.

## Plomberie de page — `@/hooks/`

| Hook                                                               | Rôle                                                                                                                                                        | Usages    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `useCurrentRole`                                                   | Rôle de l'utilisateur connecté.                                                                                                                             | 31        |
| `useSubmitDialog`                                                  | Soumission d'une modale RHF : try/catch → toast + close, ou toast d'erreur traduit. Ne gère **ni** l'état **ni** la validation.                             | 28        |
| `useRealtimeRefresh(table, clé\|clés[])`                           | Canal **partagé** par table. Pour les OT, passer `OT_QUERY_KEYS`.                                                                                           | 23        |
| `useConfirmDelete`                                                 | `toDelete` + confirmation + `dialogProps` à étaler sur la modale.                                                                                           | 16        |
| `useEntityDialog`                                                  | État `{open, entity}` + `openCreate`/`openEdit` + **`dialogKey`**. La clé vaut `` `${id}-${open}` `` : c'est le `-${open}` qui purge l'état à la fermeture. | 14        |
| `useUploadDrop`                                                    | Glisser-déposer vers un `DocumentsTab` contrôlé.                                                                                                            | 3         |
| `useLeafResync`                                                    | Réécrit l'URL en `replace` quand la feuille ouverte d'un drill est renommée.                                                                                | 3         |
| `useCatalogueDrill`                                                | Socle des explorateurs à paliers (bac « Non classé », `catChain`, resync, gardes).                                                                          | 3         |
| `useTreeDrill` · `useMediaQuery` · `useScope`                      |                                                                                                                                                             | 5 / 3 / 4 |
| `useEquipementsDrill` · `useGammesDrill` · `useLocalisationsDrill` | Un par explorateur.                                                                                                                                         | 1\*       |

Briques de plomberie hors hooks : `actionsEditionSuppression` (duo Modifier/Supprimer pour `menuActions`), `SlugDetailRoute` (Resolver d'une route détail par slug).

## Libs — `@/lib/`

- `perm.*` (`permissions`) · `useSiteContext` (`site-context`) · `useAuth` (`@/auth`) · `requireNav` (`nav-guard`) · `canSeeNav`/`NavKey` (`nav`)
- `segOfUnique`/`slugify` (`slug`) — **jamais l'UUID brut dans une URL**
- `fieldErrors` / `errorMessage` / `writeErrorMessage(e, overrides?)` / `deleteErrorMessage(e, overrides?)` (`form`) — `overrides` = libellés par code SQLSTATE
- **périmètre** (`scope`) : `estCommunOuDuSite` · `siteIdPourPortee` · `LockedScope` · `resolvePorteeScope`
- `referentielQueryOptions(table, select, orderBy)` (`referentiel`) — factory des tables de référence, `staleTime` 5 min
- `listStack` / `cardGrid` (`responsive`)
- **dates nues locales** (`date`) : `formatDate` · `parseDateLocale` · `isoLocale` · `minuit` · `lundiDeLaSemaine` · `ajouterJours` · `ajouterSemaines` · `semaineIso` · `numeroSemaineIso` — **source unique**, ne jamais recopier ces primitives par feature, et ne jamais fabriquer une date nue avec `toISOString()`
- `toast` (`sonner`)

## Ossatures de feature partagées

- `catalogue-panel` (`features/bibliotheque/components/`) — ossature générique d'un panneau de catalogue, paramétrée par `queries`/`mutations`/libellés/dialogs. 2 consommateurs, tous deux hors de sa feature : **candidate à la promotion dans `common/`**.
- `CategorieCard` (`features/categories/components/`) — source unique du rendu d'une catégorie. 3 consommateurs hors feature : **même remarque**.
