---
name: nouvelle-page
description: Crée OU refond une page/écran de l'app Dédale (route TanStack Router protégée + feature) en réutilisant les composants `common/` et les patrons existants. À utiliser dès qu'on ajoute, refond ou homogénéise une page, un écran, une fiche détail ou une modale.
---

# Créer / refondre une page Dédale

> **Règle d'or : le front présente, la base valide.** La page consomme l'API et reflète rôle + site ; la RLS et les machines à états backend sont la vraie sécurité. **Ne jamais réimplémenter une coquille maison** : réutiliser les briques `common/`. « Presque pareil = pas pareil » → viser l'homogénéité avec les pages déjà faites (Sites, Investissements, Prestataires, Utilisateurs, Documents, Localisations, Équipements, Travaux, Demandes d'intervention).

Avant de coder : **choisir le patron** (§1), puis dérouler sa recette. Typage via `Database['public']['Tables']['xxx']['Row']`.
À la fin **toujours** : `npm run typecheck && npm run lint && npm run build` (le build régénère `routeTree.gen.ts`).

---

## 1. Choisir le patron

| Patron | Quand le prendre | Routes |
| --- | --- | --- |
| **Liste plate + modale** | L'entité tient sur une ligne ; l'édition est un formulaire court ; rien de riche à montrer (ni frise, ni documents, ni sous-listes) ; pas besoin d'URL partageable. | 1 route unique `<entite>.tsx`, édition par modale réutilisée create+edit. **Pas de slug.** → *Sites* |
| **Liste + détail par slug** | La fiche montre plus qu'un formulaire (description, **StatusStepper**, **DocumentsTab**, blocs métier) **ou** il faut une URL partageable. | layout `<entite>.tsx` + `<entite>/index.tsx` + `<entite>/$<entite>.tsx`. Slug lisible (`useSlugResolved` au détail pour le repli par id). → *Investissements, Travaux, Prestataires, Demandes* |
| **Explorateur à paliers (drill)** | Données **hiérarchiques** à explorer en descendant ; l'état de nav vit dans le **chemin d'URL**. | layout `<entite>.tsx` + **route splat `$.tsx`**, `PageHeader breadcrumb`, hook de drill. → *Localisations, Équipements, Bibliothèque* |

Un « détail » rendu par **dialogue piloté par état local** (ex. aperçu d'un document) n'est **pas** le patron liste+détail — pas d'URL, pas de `segOfUnique`.

---

## 2. Recette « liste + détail par slug » (patron de référence)

**Arborescence**

```
src/features/<entite>/
  queries.ts  mutations.ts  schemas.ts  (etat.ts si machine à états / cycle ; format.ts si formatage)
  components/<entite>-form-dialog.tsx
  components/<entite>-detail.tsx
src/routes/_app/<entite>.tsx            # LAYOUT pur (pas de component → Outlet) : garde rôle
src/routes/_app/<entite>/index.tsx      # LISTE
src/routes/_app/<entite>/$<entite>.tsx  # DÉTAIL, param = slug (jamais l'UUID)
```

**Étapes**

1. **queries.ts** — `xxxQueries` avec `all() => ['xxx'] as const` (clé racine pour invalider) et `list(siteId)` en `queryOptions` : `.from('xxx').select('*, relation(id, libelle)').eq('site_id', siteId).order(...).abortSignal(signal).throwOnError()`. Référentiels (statuts…) avec `staleTime`. **Pas** de query « getOne » : le détail réutilise `list`.
2. **mutations.ts** — `useCreate/useUpdate/useDelete` **purs** : `siteId` et `createdBy` arrivent en **paramètres** (c'est le composant qui lit la session). Helper `toPayload()` (`.trim()`, vides → `null`). Insert avec `site_id` + `created_by`, `.select().single().throwOnError()`. Chaque `onSuccess: qc.invalidateQueries({ queryKey: xxxQueries.all() })`. Delete : `.delete().eq('id', id).select('id').single().throwOnError()` (un 0-ligne hors RLS lève **PGRST116**, pas un faux succès).
3. **schemas.ts** — Zod (champs en `string` pour coller aux inputs), `type FormValues = z.infer<…>`, `emptyXxx()` pour la création. Machine à états → constantes d'IDs + table `TRANSITIONS` (miroir du trigger) + helper `estVerrouille()`.
4. **Layout route** — `createFileRoute('/_app/<entite>')({ beforeLoad: ({ context }) => requireNav('/<entite>', context.queryClient) })`, **sans `component`** (TanStack rend l'`Outlet`). Si page nouvelle : déclarer la `NavKey '/<entite>'` + ses rôles dans `src/lib/nav.ts` et l'item dans `app-sidebar.tsx`.
5. **index.tsx (liste)** — composant racine = **garde site** : `const { activeSiteId } = useSiteContext()` ; si `!activeSiteId` → `return <NoSiteSelected title description hint icon />`. Sinon déléguer à `<Content siteId={activeSiteId} … />` (siteId non-null → pas de hook conditionnel). Dans `Content` :
   - `const { data: role } = useCurrentRole()` + `perm.canManageMetier(role)` / `perm.isAdmin(role)` (**caler sur la RLS réelle** : ex. sur Travaux, INSERT/UPDATE = manager/technicien mais **DELETE = admin seul**) ;
   - `useQuery(xxxQueries.list(siteId))` ; states `form {open,item}`, `toDelete`, `recherche` ;
   - `<PageContainer>` › `<PageHeader title description action={canManage && <TooltipIconButton icon={<Plus/>} label="Nouveau …" variant="outline" onClick/>} />` ;
   - `<QueryState query pending={<ListRowSkeletons/>} empty={<EmptyState …/>}>` → render-prop `(data) =>` : `<SearchInput .../>` (largeur `max-w-sm`), **filtre client**, si vide → `<NoSearchResults/>`, sinon `div className={listStack}` de `<ListRow media={<RowMediaIcon icon={…}/>} title subtitle badges meta mobileMeta actions onClick/>` ;
   - **navigation** : `navigate({ to:'/<entite>/$<entite>', params:{ <entite>: segOfUnique({ nom, id }, sibs) } })` où **`sibs` = toute la liste NON filtrée** ;
   - monter `<XxxFormDialog key={form.item?.id ?? 'new'} …/>` et `<ConfirmDeleteDialog entityLabel warning …/>`.
6. **$<entite>.tsx (détail)** — **même garde site**, puis `Resolver(siteId, slug)` qui **refait** `useQuery(xxxQueries.list(siteId))` (cache partagé) : `isPending` → `<PageContainer><PageHeader title/><ListRowSkeletons/>` ; `isError` → `<ErrorState onRetry={refetch}/>` ; résoudre `data.find(i => segOfUnique({ nom:i.nom, id:i.id }, sibs) === slug)` avec le **MÊME `sibs`** ; absent → `<EmptyState title="… introuvable"/>` ; sinon `<XxxDetail item=… siteId canManage/>`.

**Points clés (non négociables)**

- **`segOfUnique` symétrie** : même ensemble de frères (toute la liste non filtrée) en **génération** (liste) ET **résolution** (détail). Replis : slug vide → `id` ; collision → suffixe `~<id 8 car>`. **Jamais l'UUID brut** dans l'URL.
- **2 gardes distinctes** : rôle au **layout** (`requireNav`, **fail-open** — si la RPC rôle échoue, on laisse passer, la RLS tranche) ; site dans **index ET détail** (`NoSiteSelected`).
- **Règle des 4 états = `QueryState`** (pending / error+retry / empty / data typée). Le 5ᵉ cas « filtre sans résultat » se traite à la main (`NoSearchResults`).
- Cloisonnement site **redondant** côté query (`.eq('site_id', siteId)`) en plus de la RLS.

---

## 3. Fiche détail (`components/<entite>-detail.tsx`)

- `<PageContainer className="flex flex-col">` (le `flex flex-col` s'applique à la zone défilante → permet une zone documents en `flex-1`) › `<PageHeader title description titleBadges action />`.
- **Action top bar** = `<TooltipIconButton>` (ex. `Paperclip` rattacher, `Pencil` éditer), **conditionnée `canManage`** (et `!verrouillé` pour l'édition d'une entité à machine à états). `titleBadges` = statut/type.
- Corps en `Card`/`CardContent`, le plus souvent **sans titre** (le contenu parle de lui-même).
- **StatusStepper** (machine à états / cycle) : `steps: StepperStep[]` calculés **en amont** dans `features/<entite>/etat.ts` (states `done/current/upcoming/rejected` **par position**, l'ordre du cycle vit côté front). Statut hors parcours → `null` → repli sur `<Badge>` (variante via un `variantStatutXxx()` du même `etat.ts`). Les boutons de transition (machine à états) sont des `<Button>` posés sous la frise.
- **DocumentsTab** (pièces jointes) : `<DocumentsTab liaison="documents_<entite>" parentColumn="<entite>_id" parentId={item.id} uploadOpen onUploadOpenChange uploadInitialFiles uploadDefaultTypeNom acceptedMimes? className? namingContext? />`. Glisser-déposer pleine page via `useFileDrop({ enabled: canManage, onFiles })` (depuis **`@/hooks/use-file-drop`**) + brique **`FileDropOverlay`** (`<FileDropOverlay show={dragging} />`, voile sobre) sur une zone `relative flex-1`. `className="min-h-0 flex-1"` dans une zone `flex flex-col` bornée → l'état vide « Aucun document » se centre. Formats par défaut = **PDF + toute image** (les images sont converties en **WebP compressé** à l'upload via `imageToWebp`, un WebP déjà optimal restant intact) ; `MIME_PDF` (PDF seul) vient de `@/features/documents/upload`. `namingContext={{ prestataire?, objet?, date? }}` → pré-remplit un nom éditable « [Type] - [Prestataire] - [Objet] - [Date] » (fonction pure `suggestDocumentName` de `@/features/documents/naming`, source unique du format). (Doctrine upload 3 étapes encapsulée par le composant.)
- Modale d'édition montée avec **`key={item.id}`**.

---

## 4. Modale de formulaire (`components/<entite>-form-dialog.tsx`)

Props : `open`, `onOpenChange`, `siteId`, `<entite>?` (présence = mode édition).

```text
state: values (init = entite ? mapToForm(entite) : emptyXxx()), errors
handleSubmit():
  const parsed = schema.safeParse(values)
  if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return }
  try {
    if (entite) await update.mutateAsync({ id, values: parsed.data })
    else        await create.mutateAsync({ siteId, createdBy: session.user.id, values: parsed.data })
    toast.success("…"); onOpenChange(false)
  } catch (e) { toast.error(errorMessage(e)) }
```

- `<FormDialog open onOpenChange title description onSubmit={() => void handleSubmit()} submitLabel pending={create.isPending || update.isPending}>` + champs `*-Field` (`TextField`, `DescriptionField`, `SelectField`, `NumberField`, `CheckboxField`, `IdentiteFields`…), chacun avec `error={errors.<champ>}`. Les `*-Field` renvoient **la valeur** dans `onChange` (pas l'event).
- La session se lit dans le composant via `useAuth()` (**`@/auth`**) ; les mutations restent pures.
- `FormDialog` ne gère **ni** state, **ni** validation, **ni** mutation, **ni** toast, **ni** reset (d'où le `key` côté hôte). Son `<form>` interne fait déjà `preventDefault` → **ne pas re-wrapper**.
- Suppression : `ConfirmDeleteDialog` (impact-aware : `blocked`/`impacts`/`warning` ; `confirmPhrase` = saisie du nom pour les cascades). Erreurs via `deleteErrorMessage(e)`.

---

## 4 bis. Les deux autres patrons (en bref)

- **Liste plate + modale** (Sites) : une seule route `<entite>.tsx` avec `component`. Même `PageContainer`/`PageHeader`/`QueryState`/`ListRow`/`SearchInput`/`ConfirmDeleteDialog`, mais **pas** de slug ni de route détail — l'action `onClick`/`Pencil` ouvre directement la modale d'édition (`key={item?.id ?? 'new'}`).
- **Explorateur à paliers (drill)** (Localisations/Équipements) : layout `<entite>.tsx` + **route splat `<entite>/$.tsx`** ; `PageContainer fill` (l'enfant pose son scroll `min-h-0 flex-1 overflow-y-auto`) ; nav via `PageHeader breadcrumb` (ancêtres cliquables, jamais le nœud courant) ; état du chemin porté par un hook de drill dédié (`useTreeDrill`, `useEquipementsDrill`, `useLocalisationsDrill`, `useBiblioDrill`, `useBiblioTreeDrill`), segments en `segOfUnique`. Entités illustrées → `MiniatureThumb` en `media` de `ListRow`. En mode `fill`, l'explorateur **reconstruit** l'en-tête fixe + le corps que `PageContainer` non-`fill` fournissait : en-tête en `shrink-0 px-4 pt-6 sm:px-6 lg:px-8`, corps via un helper `ScrollBody` (`min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8`).
  - **Split 50/50 dans un palier** (Plan de maintenance : sous-catégorie = gammes en haut / OT liés en bas, cf. `SousCategorieSplit`) : deux `<section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">` chacune avec une zone `lg:min-h-0 lg:flex-1 lg:overflow-y-auto` → **double défilement indépendant ≥ `lg`** ; **repli mobile-first** sous `lg` (flux unique empilé, `overflow-y-auto lg:overflow-hidden` sur le wrapper). Barres masquées **sans** désactiver le scroll via la classe **`no-scrollbar`** (définie en CSS non-layered dans `src/index.css` : `scrollbar-width:none` + `::-webkit-scrollbar{display:none}`, prime sur le style global des scrollbars). Relier deux features = query `.in('fk', ids)` (ex. `ordresTravailQueries.byGammes`), **queryKey = ids triés+joints** pour rester stable.
  - **Ouvrir un détail d'une AUTRE section par URL** (deep-link) : `validateSearch` (`{ ot?: string }`) sur la route cible + sélection pilotée par `Route.useSearch()` (au lieu d'un `useState`) ; ouverture = `navigate({ search: { ot: id } })` (push) ; fermeture/retour = `navigate({ search: {}, replace: true })` (**replace** → pas d'entrée d'historique parasite qui rouvrirait le détail au « précédent »).

---

## 5. Catalogue des composants réutilisables

**Coquille & en-tête** — `PageContainer` (racine de **toute** page ; défaut : 1er enfant = en-tête FIXE, le reste défile ; `fill` = l'enfant gère son scroll) · `PageHeader` (en-tête UNIQUE : `title`/`titleBadges`/`description`/`action`/`breadcrumb`/`onBack`) — tous dans `@/components/common/`.

**États** — `QueryState` (4 états) · `EmptyState` · `ErrorState` · `NoSearchResults` (liste filtrée vide) · `NoSiteSelected` (garde site, AVANT toute query) — `@/components/common/`.

**Listes** — `ListRow` (ligne générique : `media`/`title`/`subtitle`/`badges`/`meta`/`mobileMeta`/`actions`/`onClick`/`size`) · `RowMediaIcon` (icône pour entité **sans** image — passer le **composant** : `icon={HardHat}`) · `OperationRow` · `ListRowSkeletons` · `CardSkeletons` (grilles de cartes) — `@/components/common/`. Entité **avec** image → `MiniatureThumb` (`@/features/miniatures/components/miniature-thumb`) en `media`.

**Recherche / périmètre** — `SearchInput` · `SelectMenu` (`<select>` habillé, filtre par type) · `ScopeSelect` + `ScopeProvider` + `ScopeBadges` (périmètre Commun/site, Bibliothèque) — `@/components/common/`.

**Onglets & sections** — `Tabs` (+ contextes `useTabAddAction`/`useTabHeader` de `@/components/common/tab-actions`) = nav principale d'une page à onglets (Bibliothèque) · `SubTabs` = sous-onglets de sections **dans** une page (variante `segmented` = pilules sur fond arrondi `bg-muted`, pleine largeur ≥ `sm` ; défaut = souligné) · `Section`/`SectionHeader` = en-tête de section RÉUTILISABLE (`h3` icône+titre + action optionnelle ; `Section` ajoute l'enveloppe `<section flex flex-col gap-3>`, `SectionHeader` = en-tête seul quand l'hôte gère son enveloppe) — gabarit des onglets de fiche (OT/Opérations/Équipements/Modèles) · `InfoNote` = encart info/avertissement — `@/components/common/`.

**Dialogs & champs** — `FormDialog` (coquille de tout dialog formulaire) · `ConfirmDialog` (action ponctuelle/réversible) · `ConfirmDeleteDialog` (suppression définitive impact-aware) · `ExporterVersSiteDialog` · `TextField`/`TextareaField`/`DescriptionField`/`SelectField`/`NumberField`/`CheckboxField`/`IdentiteFields` · `ChampValeurInput`/`ChampsListEditor` (caractéristiques dynamiques) · `MiniatureField` (`@/features/miniatures/components/miniature-field`, upload de vignette) — `@/components/common/` sauf indiqué.

**Statut & documents** — `StatusStepper` (frise, states calculés en amont) · `DocumentsTab` (pièces jointes, doctrine 3 étapes) · `FileDropField` (zone de dépôt dans un dialog) · `FileDropOverlay` (surcouche d'invite « Déposez pour rattacher » sur une zone `relative`, pilotée par `dragging` de `useFileDrop` — glisser-déposer pleine page) · `iconeFormat`/`PdfFileIcon` (icône selon le **format/MIME**, pas le type métier) — `@/components/common/`.

**Actions & layout** — `TooltipIconButton` (action icône seule + tooltip/aria ; `variant="outline"` en top bar) · `AppSidebar`/`SidebarContent`/`SiteSwitcher`/`UserMenu`/`TopBar`/`MobileHeader` (déjà câblés dans `_app` ; visibilité via `canSeeNav`) — `@/components/common/`.

**Hooks & libs** — `useCurrentRole` (`@/hooks/use-current-role`) · `perm.*` (`@/lib/permissions`) · `useSiteContext` (`@/lib/site-context`) · `useAuth` (`@/auth`) · `requireNav` (`@/lib/nav-guard`) · `canSeeNav`/`NavKey` (`@/lib/nav`) · `segOfUnique`/`slugify` (`@/lib/slug`) · `useFileDrop` (`@/hooks/use-file-drop`) + `MIME_PDF` (`@/features/documents/upload`) · `fieldErrors`/`errorMessage`/`deleteErrorMessage` (`@/lib/form`) · `listStack`/`cardGrid` (`@/lib/responsive`) · `formatDate` (`@/lib/date`) · `toast` (`sonner`) · **`useRealtimeRefresh('table', xxxQueries.all())`** (`@/hooks/use-realtime-refresh`, rafraîchit la liste sur changement Supabase realtime — utilisé par équipements/gammes/modèles/miniatures) · drill : `useTreeDrill`/`useEquipementsDrill`/`useLocalisationsDrill`/`useBiblioDrill`/`useBiblioTreeDrill` (`@/hooks/…`) · `useMediaQuery` · `useScope` (`@/hooks/…`).

---

## 6. Règles toujours actives

- **Tout en français accentué** — UI, libellés, erreurs, commentaires. Jamais d'ASCII dégradé.
- **TypeScript strict, pas de `any`.** Erreurs Supabase **toujours** gérées : `.throwOnError()` + UI (toast / `ErrorState`). RLS en lecture = **résultat vide** (`.maybeSingle()` si l'absence est normale) ; INSERT/UPDATE/DELETE hors scope = **erreur** (`42501`) à catcher. Transition d'état interdite = erreur backend → catcher + toast.
- **Tokens sémantiques** (`bg-primary`, `text-warning`, `text-destructive`, `text-success`…), **jamais** de couleur en dur. `destructive` **réservé aux actions** ; `warning` = état défavorable.
- **Mobile-first** : toute page s'ouvre sur `<PageContainer>` ; grilles via `cardGrid`, listes via `listStack`. `badges`/`meta` de `ListRow` disparaissent sous `sm` → passer `mobileMeta` pour l'info discriminante.
- **Hard-delete** (plus de soft-delete) : **ne jamais** filtrer `.is('deleted_at', null)` (la colonne n'existe plus). Garde-fous FK : `RESTRICT` (conteneur non vide → suppression bloquée, à présenter via `blocked`/`blockedReason`) vs `CASCADE` (liaisons retirées — le dire dans le `warning`).
- **Invalidation** : `qc.invalidateQueries({ queryKey: xxxQueries.all() })` (clé racine). Mutation transverse/cascade (RPC `supprimer_site_cascade`…) → `qc.invalidateQueries()` **global** (sans clé).
- **Upload = 3 étapes** : Storage → insert `documents` (avec `site_id`) → insert table de liaison — encapsulé par `DocumentsTab`.
- **Types Supabase** : après une migration backend, `npm run gen:types` (exige `npx supabase login`). Tant que la migration n'est pas déployée, on édite `database.types.ts` **à la main** comme pont.

## Après

- `npm run typecheck && npm run lint && npm run build` au vert.
- Nouvelle décision d'archi tranchée → l'ajouter dans `docs/decisions/`.
