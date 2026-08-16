# Patrons de page — recettes détaillées

> Référence chargée à la demande depuis `SKILL.md`. Le choix du patron se fait dans le SKILL ; ici on déroule la recette.
>
> Le câblage des modales est traité par le skill **`modale`**, celui des briques partagées par **`brique-commune`**.

## Patron A — Recette « liste + détail par slug » (patron de référence)

**Arborescence**

```
src/features/<entite>/
  page-meta.ts                          # identité de la page : titre/description/hint/icone
  queries.ts  mutations.ts  schemas.ts  (etat.ts si machine à états / cycle ; format.ts si formatage)
  components/<entite>-form-dialog.tsx
  components/<entite>-detail.tsx
src/routes/_app/<entite>.tsx            # LAYOUT pur (pas de component → Outlet) : garde rôle
src/routes/_app/<entite>/index.tsx      # LISTE
src/routes/_app/<entite>/$<entite>.tsx  # DÉTAIL, param = slug (jamais l'UUID)
```

`page-meta.ts` est la **source unique** de l'identité de la page — consommé par la liste, le
détail, la garde de site et le `PageHeader` :

```ts
export const PAGE_META: PageMeta = {
  titre: 'Travaux',
  description: 'Travaux ponctuels du site.',
  hint: 'Choisis un site pour voir ses travaux.',
  icone: HardHat,
}
```

Saisi deux fois, il diverge : c'est arrivé sur 5 pages sur 6 avant que la brique n'existe, et
Planning et Gammes divergent encore aujourd'hui pour cette raison exacte.

**Étapes**

1. **queries.ts** — `xxxQueries` avec `all() => ['xxx'] as const` (clé racine pour invalider) et `list(siteId)` en `queryOptions` : `.from('xxx').select('*, relation(id, libelle)').eq('site_id', siteId).order(...).abortSignal(signal).throwOnError()`. Référentiels (statuts…) avec `staleTime`. **Pas** de query « getOne » : le détail réutilise `list`.
2. **mutations.ts** — `useCreate/useUpdate/useDelete` **purs** : `siteId` et `createdBy` arrivent en **paramètres** (c'est le composant qui lit la session). Helper `toPayload()` (`.trim()`, vides → `null`). Insert avec `site_id` + `created_by`, `.select().single().throwOnError()`. Chaque `onSuccess: qc.invalidateQueries({ queryKey: xxxQueries.all() })`. Delete : `.delete().eq('id', id).select('id').single().throwOnError()` (un 0-ligne hors RLS lève **PGRST116**, pas un faux succès).
3. **schemas.ts** — Zod (champs en `string` pour coller aux inputs), `type FormValues = z.infer<…>`, `emptyXxx()` pour la création. Machine à états → constantes d'IDs + table `TRANSITIONS` (miroir du trigger) + helper `estVerrouille()`.
4. **Layout route** — `createFileRoute('/_app/<entite>')({ beforeLoad: ({ context }) => requireNav('/<entite>', context.queryClient) })`, **sans `component`** (TanStack rend l'`Outlet`). Si page nouvelle : déclarer la `NavKey '/<entite>'` + ses rôles dans `src/lib/nav.ts` et l'item dans `app-sidebar.tsx`.
5. **index.tsx (liste)** — composant racine = **`SiteScopedRoute`** (`@/components/common/site-scoped-route`), jamais la garde à la main. Elle rend `NoSiteSelected` tant qu'aucun site n'est actif et n'appelle son enfant qu'ensuite — donc **avant toute query**, sans hook conditionnel :

   ```tsx
   function TravauxPage() {
     return (
       <SiteScopedRoute meta={PAGE_META}>
         {({ siteId, canManage }) => (
           <TravauxContent
             siteId={siteId}
             canManage={canManage}
             canDelete={canManage}
           />
         )}
       </SiteScopedRoute>
     )
   }
   ```

   La brique expose `{ siteId, role, canManage }` (`canManage` = `perm.canManageMetier(role)`). **Ne jamais appeler `NoSiteSelected` directement** : elle n'a plus qu'un consommateur, la brique elle-même.

   **Permissions affinées** : `canManage` est le défaut générique. Une page dont la RLS diffère passe ses propres prédicats **explicitement** (ex. Demandes : `perm.canCreateDemande(role)`, `perm.canResolveDemande(role)`), avec un commentaire disant pourquoi. Caler sur la RLS réelle, et la **vérifier** plutôt que la supposer : depuis la migration 053, manager et technicien suppriment aussi sur leurs sites (`canDelete={canManage}` sur Travaux comme sur Investissements). Les seuls écrans admin-only sont les référentiels et les sites.

   Dans `Content` :
   - `useQuery(xxxQueries.list(siteId))` ; `useEntityDialog` (modale), `useConfirmDelete` (suppression), `useRealtimeRefresh` si la liste doit vivre sans F5 ; states `recherche` et `statutFilter` ;
   - `<PageContainer>` › `<PageHeader title={PAGE_META.titre} description={PAGE_META.description} action={canManage && <TooltipIconButton icon={<Plus/>} label="Nouveau …" variant="outline" onClick/>} />` ;
   - `<QueryState query pending={<ListRowSkeletons/>} empty={<EmptyState …/>}>` → render-prop `(data) =>` : filtre client, puis **`<ListPageBody>`** (`@/components/common/list-page-body`) qui porte la séquence complète **barre `ListFilterBar` pleine largeur → « aucun résultat » → `listStack`**. Ne PAS remonter `ListFilterBar`, `NoSearchResults` ou `listStack` à la main, ni brider la barre en `max-w-sm` :

     ```tsx
     <ListPageBody
       search={recherche} onSearchChange={setRecherche} searchPlaceholder="Rechercher un travaux…"
       filterValue={statutFilter} onFilterChange={setStatutFilter} options={statutOptions}
       filterLabel="Filtrer par statut"
       isEmpty={shown.length === 0}
       emptySearchDescription="Aucun travaux ne correspond à ces critères."
     >
       {shown.map((c) => <ListRow key={c.id} … />)}
     </ListPageBody>
     ```

     `filterValue` omis → barre de recherche seule. Sentinelles `FILTRE_TOUS` / `FILTRE_NON_TERMINES`, **jamais une chaîne vide** ; défaut « non terminés » sur toute liste à statuts terminaux ;

   - **navigation** : `navigate({ to:'/<entite>/$<entite>', params:{ <entite>: segOfUnique({ nom, id }, sibs) } })` où **`sibs` = toute la liste NON filtrée** ;
   - monter `<XxxFormDialog key={dlg.dialogKey} …/>` (voir le point clé ci-dessous) et `<ConfirmDeleteDialog entityLabel warning …/>`.

6. **$<entite>.tsx (détail)** — **même `SiteScopedRoute`**, puis `Resolver(siteId, slug)` qui **refait** `useQuery(xxxQueries.list(siteId))` (cache partagé) : `isPending` → `<PageContainer><PageHeader title/><ListRowSkeletons/>` ; `isError` → `<ErrorState onRetry={refetch}/>` ; résoudre `data.find(i => segOfUnique({ nom:i.nom, id:i.id }, sibs) === slug)` avec le **MÊME `sibs`** ; absent → `<EmptyState title="… introuvable"/>` ; sinon `<XxxDetail item=… siteId canManage/>`.

**Points clés (non négociables)**

- **`segOfUnique` symétrie** : même ensemble de frères (toute la liste non filtrée) en **génération** (liste) ET **résolution** (détail). Replis : slug vide → `id` ; collision → suffixe `~<id 8 car>`. **Jamais l'UUID brut** dans l'URL.
- **2 gardes distinctes** : rôle au **layout** (`requireNav`, **fail-open** — si la RPC rôle échoue, on laisse passer, la RLS tranche) ; site dans **index ET détail** via **`SiteScopedRoute`**, avant toute query.
- **Règle des 4 états = `QueryState`** (pending / error+retry / empty / data typée). Le 5ᵉ cas « filtre sans résultat » est porté par **`ListPageBody`** (prop `isEmpty`), pas écrit à la main. Le squelette passe le **même `size`** que les lignes réelles.
- **Clé de la modale : `key={dlg.dialogKey}`** (`useEntityDialog`), jamais `key={item.id}` ni `key={item?.id ?? 'new'}`. La clé vaut `` `${id ?? 'new'}-${open}` `` (`use-entity-dialog.ts:59`) : c'est le `-${open}` qui purge l'état à la fermeture. Sans lui, react-hook-form ressuscite une saisie annulée.

  > Cette règle est répétée plus bas, dans la fiche détail. Ce n'est pas un oubli : elle a été écrite **deux fois de deux façons contradictoires** dans la doctrine, et la version fausse a survécu à la correction de la version juste. Les deux occurrences doivent rester identiques ; si l'une bouge, l'autre bouge.

- Cloisonnement site **redondant** côté query (`.eq('site_id', siteId)`) en plus de la RLS.
- **Ne jamais afficher une panne comme une absence de données** : déstructurer `isPending`/`isError`, pas seulement `data`. Un `?? []` silencieux transforme une erreur réseau en « aucun élément » — un mensonge à l'utilisateur.

---

## Fiche détail (`components/<entite>-detail.tsx`)

- **Fiche simple (sans onglets)** : `<PageContainer className="flex flex-col">` (le `flex flex-col` s'applique à la zone défilante → permet une zone documents en `flex-1`) › `<PageHeader title description titleBadges action />`. Colonne étroite (réglages, fiche d'une personne) → `bodyMaxWidth="max-w-2xl"` plutôt qu'un `div` centré englobant : envelopper en-tête ET cartes ne laisse qu'**un** enfant au conteneur, et l'en-tête part alors au défilement.
- **Fiche À ONGLETS** : `DetailTabsShell` (`@/components/common/detail-tabs-shell`) — en-tête + carte d'en-tête + `SubTabs` fixes, puis zone de contenu défilante. Trois consommateurs : gamme, ordre de travail, prestataire.

  > **Contrainte non négociable : l'hôte est en `<PageContainer fill>`.** Le shell porte **sa propre** zone défilante ; hors mode `fill`, `PageContainer` traite son 1er enfant comme en-tête FIXE `shrink-0` — et comme le shell fusionne en-tête _et_ corps en un seul enfant, la fiche entière y atterrit : le corps perd sa hauteur bornée, cesse de défiler et se fait clipper par le `main`. C'est exactement la régression corrigée en `070e007`, qui rendait les dernières opérations d'un OT inatteignables. Le mode `fill` ne pose aucun padding : reprendre les gouttières à la main (`px-4 pt-6 pb-6 sm:px-6 lg:px-8`) sur le `className` du shell.
  >
  > Corollaire : ne jamais juger cette géométrie sur `npm run verify` — elle est verte dans les deux cas. Le contrôle est visuel, sur une fiche **plus haute que l'écran**, et **dans les deux rôles** : sans les actions de gestion, le nombre d'enfants change et la branche empruntée aussi.

- **Squelette de chargement** : `DetailSkeleton` pour une fiche (pas `ListRowSkeletons`, qui annonce des lignes de liste).
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
- **`SelectField`** : API `options={[{ value, label }]}` (Select **Radix** thémé `SelectDropdown`, fini les `<option>`). Placeholder via `placeholder`. **Jamais d'item à `value=""`** : Radix réserve la chaîne vide à « pas de valeur » (`shouldShowPlaceholder`), donc un tel item n'affiche **jamais** son libellé une fois choisi. Option neutre facultative → prop **`optionAucune="— Aucun —"`** : sentinelle `SELECT_AUCUN` interne (`@/components/ui/select-dropdown`), retraduite en **`''`** vers le formulaire — `''` est la convention du projet pour « absence » (champs en `string` pour coller aux inputs, cf. `optionalIntId`). Deux formulations seulement dans toute l'app : « — Aucun — » (option neutre) et « — Choisir … — » (placeholder d'un champ requis).

  **Un champ facultatif prend `optionAucune`, jamais `placeholder`** : un placeholder n'est **pas sélectionnable**, donc une valeur posée par erreur ne peut plus être retirée depuis l'écran. C'est la régression corrigée en `e216bff` — un équipement rattaché à une demande d'intervention devenait indétachable.

- **`SwitchField`** (interrupteur Radix) : choix **binaire** (actif/inactif, A/B), à préférer à un `SelectField` à deux options. Un champ ENUM (pas booléen) reste un `SelectField`/`RadioField` (ou un `FormField` + `Switch` avec mapping enum↔booléen si un interrupteur est voulu, cf. `gamme-form-dialog`).
- **`useSubmitDialog`** (`@/hooks/use-submit-dialog`) porte la plomberie de soumission : `try/catch` → toast succès + `close` (ou toast d'erreur `writeErrorMessage`, dialog laissé ouvert). Il ne gère NI l'état NI la validation (c'est RHF). `onSuccess?` pour une redirection post-création ; `errorMessage?` pour surcharger la traduction SQLSTATE.
- Reset : `defaultValues` recalculés au **remontage** de la modale (`key={dlg.dialogKey}` côté hôte via `useEntityDialog`), jamais un `useEffect` de reset. La session se lit via `useAuth()` (**`@/auth`**) ; les mutations restent pures.
- `FormDialog` (sur `DialogShell`) ne gère NI état NI validation NI mutation ; son `<form>` fait déjà `preventDefault`+`stopPropagation` (formulaires imbriqués OK) → **ne pas re-wrapper**. Composants impératifs (`value`/`onChange`, ex. `LocalEquipementFields`) : les ponter via `useWatch` (lecture) + `form.setValue` (écriture), erreurs via `form.formState.errors.<champ>`.
- **Hors react-hook-form** — quand l'hôte gère lui-même son état (éditeur de liste, carte d'une fiche, dialogue à état local) : briques **`@/components/common/standalone-fields`** (`StandaloneText`, `StandaloneSelect`, `StandaloneCheckbox`), API `value`/`onChange`. Elles portent libellé, erreur et l'`id` reliant le `<Label htmlFor>` au champ. **Ne pas détourner `fields/*`** pour cet usage (ils exigent `control`/`name`), ni réécrire un `<Label>` + `<Input>` à la main — c'est ainsi que des libellés ont fini par ne plus désigner aucun champ.
- Suppression : `ConfirmDeleteDialog` (impact-aware : `blocked`/`impacts`/`warning` ; `confirmPhrase` = saisie du nom pour les cascades). Erreurs via `deleteErrorMessage(e)`.

---

## Patrons B et C — Les deux autres patrons (en bref)

- **Liste plate + modale** (Sites) : une seule route `<entite>.tsx` avec `component`. Même `PageContainer`/`PageHeader`/`QueryState`/`ListRow`/`ListFilterBar`/`ConfirmDeleteDialog`, mais **pas** de slug ni de route détail — l'édition s'ouvre depuis le menu contextuel de `ListRow` (`menuActions`, cf. `actionsEditionSuppression`), la modale montée avec `key={dlg.dialogKey}`.
- **Explorateur à paliers (drill)** (Localisations/Équipements) : layout `<entite>.tsx` + **route splat `<entite>/$.tsx`** ; `PageContainer fill` ; nav via `PageHeader breadcrumb` (ancêtres cliquables, jamais le nœud courant) ; état du chemin porté par un hook de drill dédié (`useTreeDrill`, `useEquipementsDrill`, `useLocalisationsDrill`, `useBiblioTreeDrill`), segments en `segOfUnique`. Entités illustrées → `MiniatureThumb` en `media` de `ListRow`. En mode `fill`, l'explorateur pose lui-même l'en-tête fixe et le corps défilant — **avec les briques `FillHeader` et `ScrollBody`** exportées par `page-container.tsx`, jamais en recopiant leurs classes : elles sont la source unique des gouttières, et chaque recopie a fini par diverger.
  - **Split 50/50 dans un palier** (Plan de maintenance : sous-catégorie = gammes en haut / OT liés en bas, cf. `SousCategorieSplit`) : deux `<section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">` chacune avec une zone `lg:min-h-0 lg:flex-1 lg:overflow-y-auto` → **double défilement indépendant ≥ `lg`** ; **repli mobile-first** sous `lg` (flux unique empilé, `overflow-y-auto lg:overflow-hidden` sur le wrapper). Barres masquées **sans** désactiver le scroll via la classe **`no-scrollbar`** (définie en CSS non-layered dans `src/index.css` : `scrollbar-width:none` + `::-webkit-scrollbar{display:none}`, prime sur le style global des scrollbars). Relier deux features = query `.in('fk', ids)` (ex. `ordresTravailQueries.byGammes`), **queryKey = ids triés+joints** pour rester stable.
  - **Ouvrir un détail d'une AUTRE section par URL** (deep-link) : `validateSearch` (`{ ot?: string }`) sur la route cible + sélection pilotée par `Route.useSearch()` (au lieu d'un `useState`) ; ouverture = `navigate({ search: { ot: id } })` (push) ; fermeture/retour = `navigate({ search: {}, replace: true })` (**replace** → pas d'entrée d'historique parasite qui rouvrirait le détail au « précédent »).

---
