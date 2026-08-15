# Conventions — Composants réutilisables

> Lue quand on crée un composant, un modal, ou qu'on se demande « où mettre ça ».

## Où mettre quoi

| Type                          | Emplacement                          | Exemple                                                                                                         |
| ----------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Générique, zéro métier        | `src/components/ui/`                 | `button`, `card`, `dialog` (shadcn)                                                                             |
| Transverse maison, non métier | `src/components/common/`             | `EmptyState`, `ErrorState`, `PageHeader`, `NoSiteSelected`, `QueryState`, `FormDialog`, `TextField`, `InfoNote` |
| Métier                        | `src/features/<domaine>/components/` | `EquipementCard`, `OtTable`                                                                                     |

Règle : si tu assembles les mêmes `ui/` de la même façon ≥ 2 fois → remonte un composant dans `common/`.

## Écrire un composant `ui`/`common`

- Signature : `function X({ className, ...props }: ComponentProps<'div'> & { ... })`.
- Toujours `className={cn('classes-de-base', className)}` pour permettre l'override.
- Variantes → **CVA** (cf. `button.tsx`, `badge.tsx`), types dérivés via `VariantProps<typeof xVariants>`.
- React 19 : pas de `forwardRef` (on prend `ComponentProps`), attribut `data-slot` pour le ciblage CSS.

## Champs de formulaire

Champs prêts à l'emploi (libellé + champ + message d'erreur) dans **`src/components/common/fields/`** — le sous-dossier, pas la racine :

- `TextField`, `SelectField`, `TextareaField`, `DescriptionField`, `NumberField`, `CheckboxField`, `SwitchField`, `RadioField`, `DateField`, `PorteeField`, `IdentiteFields`.
- Signature commune : **`control={form.control}` + `name="…"`** (+ `label`, `required?`, options du champ). **Plus de `value`/`onChange`/`error`** : l'état et la validation viennent de react-hook-form, et `FormMessage` (inclus dans chaque champ) lit l'erreur du resolver Zod.
- Primitives sous-jacentes : `ui/input`, `ui/select-dropdown` (**Radix**, pas de `<select>` natif), `ui/textarea` (style aligné : `px-3`, `h-9`, `text-base md:text-sm`, états focus/erreur/disabled).

> **Piège d'homonymie.** `common/text-field.tsx` et `common/fields/text-field.tsx` coexistent (idem `select`, `checkbox`, `number`). Les fichiers de la **racine** `common/` sont la génération 1 (API `value`/`onChange`), en cours de retrait. Toujours importer depuis **`@/components/common/fields/…`**.

→ Ne jamais recopier un `<select>`/`<textarea>` natif stylé à la main : utiliser ces champs.

## Listes asynchrones — `QueryState` (règle des 4 états)

La [règle des 4 états](./ui.md) est factorisée dans `common/query-state.tsx` :

```tsx
const query = useQuery(xxxQueries.list(siteId))
<QueryState
  query={query}
  pending={<ListRowSkeletons />}          {/* grille de cartes → CardSkeletons */}
  empty={<EmptyState icon={Icon} title="Aucun X" action={newButton} />}
>
  {(items) => <div className={cardGrid.default}>{items.map(/* … */)}</div>}
</QueryState>
```

- `QueryState` gère : chargement → `pending`, erreur → `ErrorState` (avec retry), tableau vide → `empty`, sinon `children(data)` (data garanti défini).
- Le **conteneur** (grille/liste) reste dans la render-prop ; le « aucun résultat de recherche » (filtrage client) aussi.
- `CardSkeletons` (`count` / `height` / `container`) pour les squelettes.
- Multi-requêtes : `QueryState` pilote la requête liste **principale** ; les lookups restent en `useQuery` à côté.

## Garde « site » et permissions

- `NoSiteSelected` (`common/no-site-selected.tsx`) : écran « sélectionne un site » des pages métier (props `title` / `description` / `hint` / `icon`). Ne pas recopier la garde `if (!activeSiteId)` à la main.
- Droits par rôle : fonctions pures `lib/permissions.ts` (`isAdmin`, `canManageMetier`, `canManageAdmin`, `canCreateDemande`, `canResolveDemande`, `canEditUser`), lues via `useCurrentRole()` (`import * as perm from '@/lib/permissions'`). Le front ne fait que **refléter** le rôle ; la sécurité reste portée par la RLS. Ne jamais écrire `role === 'admin'` en dur dans un écran. Jeux de rôles exportés : `ROLES_METIER` (écriture, sans lecteur) vs `ROLES_METIER_LECTURE` (visibilité, avec lecteur) — homonymes à ne pas confondre. Codes et libellés (`ROLE_CODES`, `ROLE_LABELS`, `roleLabel`) y vivent aussi (réexportés par `features/utilisateurs/schemas.ts` pour le domaine) — un composant `common/` n'importe donc jamais ces libellés depuis `features/`.
- **Visibilité de la navigation par rôle** : source unique `lib/nav.ts` (module pur). `canSeeNav(navKey, role)` décide quelles entrées la sidebar affiche **et** alimente les gardes de route ; `landingFor(role)` donne l'écran d'atterrissage (le demandeur → `/demandes`, pas de tableau de bord). C'est une **vue produit** (« on voit ce dont on doit s'occuper »), volontairement plus restrictive que la RLS si besoin. Ne pas réintroduire de tableau `roles: [...]` dans `app-sidebar.tsx`.
- `InfoNote` (`common/info-note.tsx`) : encart d'information (icône + texte).

## Modals (stratégie « simple d'abord »)

Base = **`DialogShell`** (`common/dialog-shell.tsx`) — coquille « 3 zones » (en-tête fixe / corps défilant / pied fixe, `max-h-85vh`), bâtie sur le `Dialog` shadcn dont elle hérite l'accessibilité (focus trap, Esc, aria). **Aucun `DialogContent` ne doit être monté hors de `DialogShell`** : c'est la base commune des ~45 modales de l'app, y compris les cas plein cadre (aperçu de document, recadrage, canvas).

Choisir la coquille selon l'intention, jamais recopier les classes :

| Intention                      | Coquille                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| Formulaire                     | `FormDialog`                                                                         |
| Suppression définitive         | `ConfirmDeleteDialog` (impact-aware : `warning`/`impacts`/`blocked`/`confirmPhrase`) |
| Action ponctuelle réversible   | `ConfirmDialog`                                                                      |
| Texte obligatoire avant action | `MotifDialog`                                                                        |
| Multi-sélection cochable       | `ChecklistDialog`                                                                    |
| Plein cadre (aperçu, canvas)   | `DialogShell` avec `padded`                                                          |

- **Dialog de formulaire** : **react-hook-form** + `zodResolver` dans un `<Form {...form}>` + `FormDialog` (`common/form-dialog.tsx`, bâti sur `DialogShell`) :

```tsx
const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues })
const submit = useSubmitDialog<Values>({ onSubmit, successMessage, close: () => setOpen(false) })
<Form {...form}>
  <FormDialog
    open={open}
    onOpenChange={setOpen}
    title={isEdit ? 'Modifier le X' : 'Nouveau X'}
    description="…"
    size="lg"                                  {/* optionnel : sm|md|lg|xl|full */}
    onSubmit={() => void form.handleSubmit(submit)()}
    submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
    pendingLabel="Enregistrement…"
    pending={form.formState.isSubmitting}
  >
    <TextField control={form.control} name="nom" label="Nom" required />
    {/* autres champs de @/components/common/fields/* */}
  </FormDialog>
</Form>
```

La coquille ne gère que le **visuel** ; l'état + la validation viennent de RHF/`zodResolver`, la soumission (toast + close + traduction d'erreur) de `useSubmitDialog`, le reset du **remontage** (`key`). Props utiles : `submitVariant="destructive"`, `size`, `contentClassName`.

- **Un seul modal visible à la fois** ; ne pas empiler.
- Modal métier d'édition → composant dédié `features/<domaine>/components/<entite>-form-dialog.tsx` (**kebab-case**, comme tout fichier de composant).
- État d'ouverture via **`useEntityDialog`**, et modale montée avec **`key={dlg.dialogKey}`** — jamais une clé constante, sinon une saisie annulée ressuscite à la réouverture.
- **Vues partageables par lien** : déjà en place là où c'est utile, via les search params validés (`validateSearch` + `Route.useSearch()`, ouverture en `navigate({ search })`, fermeture en `replace: true`). Le state local reste la règle pour une modale qui n'a pas vocation à être partagée.

## À NE PAS FAIRE

- ❌ Réécrire l'accessibilité d'un modal à la main ; `DialogContent` sans `DialogTitle` ; monter un `DialogContent` hors de `DialogShell`.
- ❌ Recopier le bloc des 4 états ou la coquille d'un dialog de formulaire → `QueryState` / `FormDialog`.
- ❌ Recopier un `<select>`/`<textarea>` natif stylé, ou importer un champ depuis `common/` au lieu de `common/fields/` → génération 1, en retrait.
- ❌ Monter une modale d'édition avec une clé constante (`key={item.id}`) → `key={dlg.dialogKey}`.
- ❌ Recopier la garde « sélectionne un site » → `NoSiteSelected` ; hardcoder un rôle (`role === 'admin'`) → `lib/permissions`.
- ❌ Mettre de la logique métier dans `components/ui`.
- ❌ Concaténer des classes conditionnelles à la main au lieu de CVA pour les variantes.
- ❌ Modifier lourdement un composant `ui` shadcn sans raison (préférer wrapper dans `common/`).
