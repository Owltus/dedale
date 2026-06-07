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

Champs prêts à l'emploi (libellé + champ + message d'erreur), modelés l'un sur l'autre, dans `src/components/common/` :

- `TextField`, `SelectField`, `TextareaField`. Signature commune : `label`, `value`, `onChange: (v: string) => void`, `error?`, `required?` (+ props natifs). L'`id` est généré via `useId()` si non fourni.
- Primitives sous-jacentes : `ui/input`, `ui/select`, `ui/textarea` (style aligné : `px-3`, `text-base md:text-sm`, états focus/erreur/disabled).

→ Ne jamais recopier un `<select>`/`<textarea>` natif stylé à la main : utiliser ces champs.

## Listes asynchrones — `QueryState` (règle des 4 états)

La [règle des 4 états](./ui.md) est factorisée dans `common/query-state.tsx` :

```tsx
const query = useQuery(xxxQueries.list(siteId))
<QueryState
  query={query}
  pending={<CardSkeletons count={4} height="h-40" />}
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
- Droits par rôle : fonctions pures `lib/permissions.ts` (`isAdmin`, `canManageMetier`, `canManageAdmin`, `canCreateDemande`, `canResolveDemande`, `canEditUser`), lues via `useCurrentRole()` (`import * as perm from '@/lib/permissions'`). Le front ne fait que **refléter** le rôle ; la sécurité reste portée par la RLS. Ne jamais écrire `role === 'admin'` en dur dans un écran. Jeux de rôles exportés : `ROLES_METIER` (écriture, sans lecteur) vs `ROLES_METIER_LECTURE` (visibilité, avec lecteur) — homonymes à ne pas confondre.
- **Visibilité de la navigation par rôle** : source unique `lib/nav.ts` (module pur). `canSeeNav(navKey, role)` décide quelles entrées la sidebar affiche **et** alimente les gardes de route ; `landingFor(role)` donne l'écran d'atterrissage (le demandeur → `/demandes`, pas de tableau de bord). C'est une **vue produit** (« on voit ce dont on doit s'occuper »), volontairement plus restrictive que la RLS si besoin. Ne pas réintroduire de tableau `roles: [...]` dans `app-sidebar.tsx`.
- `InfoNote` (`common/info-note.tsx`) : encart d'information (icône + texte).

## Modals (stratégie « simple d'abord »)

Base = `Dialog` shadcn (`src/components/ui/dialog.tsx`) → accessibilité gérée (focus trap, Esc, aria). État d'ouverture local :

```tsx
const [open, setOpen] = useState(false)
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Titre</DialogTitle>            {/* TOUJOURS un titre (sinon warning a11y) */}
      <DialogDescription>…</DialogDescription>
    </DialogHeader>
    {/* contenu / formulaire */}
    <DialogFooter>
      <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
      <Button onClick={…}>Valider</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- **Dialog de formulaire** : ne pas recopier cette coquille → utiliser `FormDialog` (`common/form-dialog.tsx`), qui encapsule Dialog + en-tête + `<form>` + pied Annuler/Valider :

```tsx
<FormDialog
  open={open}
  onOpenChange={setOpen}
  title={isEdit ? 'Modifier le X' : 'Nouveau X'}
  description="…"
  onSubmit={() => void handleSubmit()}
  submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
  pendingLabel="Enregistrement…"
  pending={mutation.isPending}
>
  {/* champs (TextField, SelectField…) */}
</FormDialog>
```

La coquille ne gère que le **visuel** : l'état (`useState`), la validation Zod (`safeParse` + `fieldErrors`), les mutations/toasts et le reset restent dans ton composant. Props utiles : `submitVariant="destructive"`, `contentClassName` (ex. `max-h-[90vh] overflow-y-auto`).

- **Un seul modal visible à la fois** ; ne pas empiler.
- Modal métier d'édition → composant dédié `features/<domaine>/components/<Entité>Dialog.tsx`.
- Si le volume de modals devient ingérable ou qu'on veut des vues **partageables par lien**, on réévaluera (gestionnaire global type nice-modal, ou pilotage par l'URL). Pour l'instant : state local + composant dédié.

## À NE PAS FAIRE

- ❌ Réécrire l'accessibilité d'un modal à la main ; `DialogContent` sans `DialogTitle`.
- ❌ Recopier le bloc des 4 états ou la coquille d'un dialog de formulaire → `QueryState` / `FormDialog`.
- ❌ Recopier un `<select>`/`<textarea>` natif stylé → `SelectField` / `TextareaField`.
- ❌ Recopier la garde « sélectionne un site » → `NoSiteSelected` ; hardcoder un rôle (`role === 'admin'`) → `lib/permissions`.
- ❌ Mettre de la logique métier dans `components/ui`.
- ❌ Concaténer des classes conditionnelles à la main au lieu de CVA pour les variantes.
- ❌ Modifier lourdement un composant `ui` shadcn sans raison (préférer wrapper dans `common/`).
