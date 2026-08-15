# Patrons de page — recettes détaillées

> Référence chargée à la demande depuis `SKILL.md`. Le choix du patron se fait dans le SKILL ; ici on déroule la recette.
>
> Le câblage des modales est traité par le skill **`modale`**, celui des briques partagées par **`brique-commune`**.

## Patron A — Recette « liste + détail par slug » (patron de référence)

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
   - `<QueryState query pending={<ListRowSkeletons/>} empty={<EmptyState …/>}>` → render-prop `(data) =>` : **`<ListFilterBar>`** (`@/components/common/list-filter-bar` — **source UNIQUE** de la barre d'une page liste, **pleine largeur** ; le prop `filterValue` omis → barre de recherche seule. Ne PAS remonter un `SearchInput` nu ni le brider en `max-w-sm`), **filtre client**, si vide → `<NoSearchResults/>`, sinon `div className={listStack}` de `<ListRow media={<RowMediaIcon icon={…}/>} title subtitle badges meta mobileMeta actions onClick/>` ;
   - **navigation** : `navigate({ to:'/<entite>/$<entite>', params:{ <entite>: segOfUnique({ nom, id }, sibs) } })` où **`sibs` = toute la liste NON filtrée** ;
   - monter `<XxxFormDialog key={form.item?.id ?? 'new'} …/>` et `<ConfirmDeleteDialog entityLabel warning …/>`.
6. **$<entite>.tsx (détail)** — **même garde site**, puis `Resolver(siteId, slug)` qui **refait** `useQuery(xxxQueries.list(siteId))` (cache partagé) : `isPending` → `<PageContainer><PageHeader title/><ListRowSkeletons/>` ; `isError` → `<ErrorState onRetry={refetch}/>` ; résoudre `data.find(i => segOfUnique({ nom:i.nom, id:i.id }, sibs) === slug)` avec le **MÊME `sibs`** ; absent → `<EmptyState title="… introuvable"/>` ; sinon `<XxxDetail item=… siteId canManage/>`.

**Points clés (non négociables)**

- **`segOfUnique` symétrie** : même ensemble de frères (toute la liste non filtrée) en **génération** (liste) ET **résolution** (détail). Replis : slug vide → `id` ; collision → suffixe `~<id 8 car>`. **Jamais l'UUID brut** dans l'URL.
- **2 gardes distinctes** : rôle au **layout** (`requireNav`, **fail-open** — si la RPC rôle échoue, on laisse passer, la RLS tranche) ; site dans **index ET détail** (`NoSiteSelected`).
- **Règle des 4 états = `QueryState`** (pending / error+retry / empty / data typée). Le 5ᵉ cas « filtre sans résultat » se traite à la main (`NoSearchResults`).
- Cloisonnement site **redondant** côté query (`.eq('site_id', siteId)`) en plus de la RLS.

---

## Fiche détail (`components/<entite>-detail.tsx`)

- `<PageContainer className="flex flex-col">` (le `flex flex-col` s'applique à la zone défilante → permet une zone documents en `flex-1`) › `<PageHeader title description titleBadges action />`.
- **Action top bar** = `<TooltipIconButton>` (ex. `Paperclip` rattacher, `Pencil` éditer), **conditionnée `canManage`** (et `!verrouillé` pour l'édition d'une entité à machine à états). `titleBadges` = statut/type.
- Corps en `Card`/`CardContent`, le plus souvent **sans titre** (le contenu parle de lui-même).
- **StatusStepper** (machine à états / cycle) : `steps: StepperStep[]` calculés **en amont** dans `features/<entite>/etat.ts` (states `done/current/upcoming/rejected` **par position**, l'ordre du cycle vit côté front). Statut hors parcours → `null` → repli sur `<Badge>` (variante via un `variantStatutXxx()` du même `etat.ts`). Les boutons de transition (machine à états) sont des `<Button>` posés sous la frise.
- **DocumentsTab** (pièces jointes) : `<DocumentsTab liaison="documents_<entite>" parentColumn="<entite>_id" parentId={item.id} uploadOpen onUploadOpenChange uploadInitialFiles uploadDefaultTypeNom acceptedMimes? className? namingContext? />`. Glisser-déposer pleine page via `useFileDrop({ enabled: canManage, onFiles })` (depuis **`@/hooks/use-file-drop`**) + brique **`FileDropOverlay`** (`<FileDropOverlay show={dragging} />`, voile sobre) sur une zone `relative flex-1`. `className="min-h-0 flex-1"` dans une zone `flex flex-col` bornée → l'état vide « Aucun document » se centre. Formats par défaut = **PDF + toute image** (les images sont converties en **WebP compressé** à l'upload via `imageToWebp`, un WebP déjà optimal restant intact) ; `MIME_PDF` (PDF seul) vient de `@/features/documents/upload`. `namingContext={{ prestataire?, objet?, date? }}` → pré-remplit un nom éditable « [Type] - [Prestataire] - [Objet] - [Date] » (fonction pure `suggestDocumentName` de `@/features/documents/naming`, source unique du format). (Doctrine upload 3 étapes encapsulée par le composant.)
- Modale d'édition montée avec **`key={dlg.dialogKey}`** (`useEntityDialog`), jamais `key={item.id}`. La clé vaut `` `${id ?? 'new'}-${open}` `` (`use-entity-dialog.ts:59`) : c'est le `-${open}` qui purge l'état à la fermeture. Une clé constante laisse react-hook-form ressusciter une saisie annulée.

---

## Modale de formulaire

> Déplacé : voir le skill `modale` (arbre de décision + câblage complet). Le résumé ci-dessous ne garde que ce qui touche la PAGE hôte.

Props : `open`, `onOpenChange`, `siteId`, `<entite>?` (présence = mode édition).

Patron **react-hook-form + `zodResolver`** (le hook maison `useFormDialog` a été retiré) :

```tsx
const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: entite ? mapToForm(entite) : emptyXxx() })
// Schéma à TRANSFORM (z.string().transform → number, z.coerce…) → 3 génériques :
//   useForm<FormValues /* z.input */, unknown, Values /* z.output */>  +  useSubmitDialog<Values>
const submit = useSubmitDialog<FormValues>({
  onSubmit: (data) => entite ? update.mutateAsync({ id, values: data })
                             : create.mutateAsync({ siteId, createdBy: session.user.id, values: data }),
  successMessage: entite ? '… modifié' : '… créé',
  close: () => onOpenChange(false),
})
return (
  <Form {...form}>                                {/* = FormProvider de @/components/ui/form */}
    <FormDialog open onOpenChange title description size?
      onSubmit={() => void form.handleSubmit(submit)()}
      submitLabel pendingLabel pending={form.formState.isSubmitting}>
      <TextField control={form.control} name="nom" label="Nom" required />
    </FormDialog>
  </Form>
)
```

- Champs de **`@/components/common/fields/*`** (`TextField`/`TextareaField`/`DescriptionField`/`SelectField`/`NumberField`/`CheckboxField`/`SwitchField`/`RadioField`/`PorteeField`/`IdentiteFields`), chacun branché sur `control={form.control}` + `name="…"` (+ ses options). **Plus de `value`/`onChange`/`error`** : `FormMessage` (dans chaque champ) lit l'erreur du resolver Zod.
- **`SelectField`** : API `options={[{ value, label }]}` (Select **Radix** thémé `SelectDropdown`, fini les `<option>`). Placeholder via `placeholder`. **Jamais d'item à `value=""`** : Radix réserve la chaîne vide à « pas de valeur » (`shouldShowPlaceholder`), donc un tel item n'affiche **jamais** son libellé une fois choisi. Option neutre facultative → prop **`optionAucune="— Aucun —"`** (sentinelle interne au champ, remappée en `null` à la soumission). Deux formulations seulement dans toute l'app : « — Aucun — » (option neutre) et « — Choisir … — » (placeholder d'un champ requis).
- **`SwitchField`** (interrupteur Radix) : choix **binaire** (actif/inactif, A/B), à préférer à un `SelectField` à deux options. Un champ ENUM (pas booléen) reste un `SelectField`/`RadioField` (ou un `FormField` + `Switch` avec mapping enum↔booléen si un interrupteur est voulu, cf. `gamme-form-dialog`).
- **`useSubmitDialog`** (`@/hooks/use-submit-dialog`) porte la plomberie de soumission : `try/catch` → toast succès + `close` (ou toast d'erreur `writeErrorMessage`, dialog laissé ouvert). Il ne gère NI l'état NI la validation (c'est RHF). `onSuccess?` pour une redirection post-création ; `errorMessage?` pour surcharger la traduction SQLSTATE.
- Reset : `defaultValues` recalculés au **remontage** de la modale (`key={dlg.dialogKey}` côté hôte via `useEntityDialog`), jamais un `useEffect` de reset. La session se lit via `useAuth()` (**`@/auth`**) ; les mutations restent pures.
- `FormDialog` (sur `DialogShell`) ne gère NI état NI validation NI mutation ; son `<form>` fait déjà `preventDefault`+`stopPropagation` (formulaires imbriqués OK) → **ne pas re-wrapper**. Composants impératifs (`value`/`onChange`, ex. `LocalEquipementFields`) : les ponter via `useWatch` (lecture) + `form.setValue` (écriture), erreurs via `form.formState.errors.<champ>`.
- Suppression : `ConfirmDeleteDialog` (impact-aware : `blocked`/`impacts`/`warning` ; `confirmPhrase` = saisie du nom pour les cascades). Erreurs via `deleteErrorMessage(e)`.

---

## Patrons B et C — Les deux autres patrons (en bref)

- **Liste plate + modale** (Sites) : une seule route `<entite>.tsx` avec `component`. Même `PageContainer`/`PageHeader`/`QueryState`/`ListRow`/`ListFilterBar`/`ConfirmDeleteDialog`, mais **pas** de slug ni de route détail — l'édition s'ouvre depuis le menu contextuel de `ListRow` (`menuActions`, cf. `actionsEditionSuppression`), la modale montée avec `key={dlg.dialogKey}`.
- **Explorateur à paliers (drill)** (Localisations/Équipements) : layout `<entite>.tsx` + **route splat `<entite>/$.tsx`** ; `PageContainer fill` (l'enfant pose son scroll `min-h-0 flex-1 overflow-y-auto`) ; nav via `PageHeader breadcrumb` (ancêtres cliquables, jamais le nœud courant) ; état du chemin porté par un hook de drill dédié (`useTreeDrill`, `useEquipementsDrill`, `useLocalisationsDrill`, `useBiblioDrill`, `useBiblioTreeDrill`), segments en `segOfUnique`. Entités illustrées → `MiniatureThumb` en `media` de `ListRow`. En mode `fill`, l'explorateur **reconstruit** l'en-tête fixe + le corps que `PageContainer` non-`fill` fournissait : en-tête en `shrink-0 px-4 pt-6 sm:px-6 lg:px-8`, corps via un helper `ScrollBody` (`min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8`).
  - **Split 50/50 dans un palier** (Plan de maintenance : sous-catégorie = gammes en haut / OT liés en bas, cf. `SousCategorieSplit`) : deux `<section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">` chacune avec une zone `lg:min-h-0 lg:flex-1 lg:overflow-y-auto` → **double défilement indépendant ≥ `lg`** ; **repli mobile-first** sous `lg` (flux unique empilé, `overflow-y-auto lg:overflow-hidden` sur le wrapper). Barres masquées **sans** désactiver le scroll via la classe **`no-scrollbar`** (définie en CSS non-layered dans `src/index.css` : `scrollbar-width:none` + `::-webkit-scrollbar{display:none}`, prime sur le style global des scrollbars). Relier deux features = query `.in('fk', ids)` (ex. `ordresTravailQueries.byGammes`), **queryKey = ids triés+joints** pour rester stable.
  - **Ouvrir un détail d'une AUTRE section par URL** (deep-link) : `validateSearch` (`{ ot?: string }`) sur la route cible + sélection pilotée par `Route.useSearch()` (au lieu d'un `useState`) ; ouverture = `navigate({ search: { ot: id } })` (push) ; fermeture/retour = `navigate({ search: {}, replace: true })` (**replace** → pas d'entrée d'historique parasite qui rouvrirait le détail au « précédent »).

---
