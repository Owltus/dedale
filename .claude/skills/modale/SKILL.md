---
name: modale
description: Crée ou câble une modale dans l'app Dédale — formulaire, confirmation, suppression, saisie de motif, liste cochable, plein cadre. À utiliser dès qu'on ajoute, refond ou débogue un dialog.
---

# Créer une modale Dédale

> **`DialogShell` est la base commune de TOUTES les modales.** Aucun `DialogContent` ne doit être monté hors d'elle — c'est la seule règle structurelle de ce skill, et elle est aujourd'hui tenue à 100 % sur ~45 modales. Ne pas être celui qui la casse.

## 1. Choisir la coquille

| Intention                        | Coquille                         | Note                                                                             |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Saisir ou modifier une entité    | **`FormDialog`**                 | react-hook-form + `zodResolver`                                                  |
| Supprimer définitivement         | **`ConfirmDeleteDialog`**        | nomme l'objet dans le titre, porte `warning`/`impacts`/`blocked`/`confirmPhrase` |
| Action ponctuelle **réversible** | `ConfirmDialog`                  | jamais pour une suppression                                                      |
| Exiger un texte avant d'agir     | `MotifDialog`                    | clôture avec compte-rendu, refus, annulation                                     |
| Cocher plusieurs éléments        | `ChecklistDialog` (+ `CheckRow`) | recherche intégrée                                                               |
| Aperçu, canvas, recadrage        | `DialogShell` avec `padded`      | corps plein cadre                                                                |

**Le test qui tranche entre les deux confirmations** : l'action est-elle rattrapable ? Détacher un document → `ConfirmDialog`. Le supprimer → `ConfirmDeleteDialog`. Une même action ne doit jamais ouvrir deux modales différentes selon l'écran d'où on part.

## 2. Câbler un formulaire

```tsx
const dlg = useEntityDialog<Site>()          // état + dialogKey

const form = useForm<FormValues>({
  resolver: zodResolver(schema),
  defaultValues: site ? mapToForm(site) : emptySite(),
})

const submit = useSubmitDialog<FormValues>({
  onSubmit: (data) =>
    site ? update.mutateAsync({ id: site.id, values: data })
         : create.mutateAsync({ siteId, createdBy: session.user.id, values: data }),
  successMessage: site ? 'Site modifié' : 'Site créé',
  close: () => onOpenChange(false),
})

<Form {...form}>
  <FormDialog
    open={open} onOpenChange={onOpenChange}
    title={site ? 'Modifier le site' : 'Nouveau site'}
    onSubmit={() => void form.handleSubmit(submit)()}
    submitLabel={site ? 'Enregistrer' : 'Créer'}
    pendingLabel="Enregistrement…"
    pending={form.formState.isSubmitting}
  >
    <TextField control={form.control} name="nom" label="Nom" required />
  </FormDialog>
</Form>
```

Répartition des rôles, à ne pas mélanger : **RHF** porte l'état et la validation · **`useSubmitDialog`** porte la soumission (try/catch → toast + fermeture, ou toast d'erreur traduit) · **`FormDialog`** ne porte que le visuel.

### Les cinq pièges vérifiés

1. **`key={dlg.dialogKey}`, jamais `key={item.id}`.** La clé vaut `` `${id}-${open}` `` : c'est le `-${open}` qui purge l'état à la fermeture. Avec une clé constante, **une saisie annulée réapparaît à la réouverture** — le défaut qu'avait la fiche Travaux.
2. **Ne pas re-wrapper le `<form>`.** Celui de `FormDialog` fait déjà `preventDefault` + `stopPropagation` (les formulaires imbriqués fonctionnent). Un bouton icône dans un formulaire prend `type="button"`, sinon il soumet.
3. **Sur un `<form>` NU (hors `FormDialog`), passer l'événement** : `onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}`. Sans lui, pas de `preventDefault`, donc **soumission native et rechargement de la page** — le bug qu'avait Mon profil.
4. **Jamais d'option `{ value: '' }`** dans un `SelectField` : Radix y voit « pas de valeur » et le libellé choisi ne s'affiche jamais. Utiliser `optionAucune`.
5. **Un dialog ne vit jamais sous une garde qui peut tomber pendant qu'il est ouvert** (verrou arrivé en temps réel, palier d'URL via le bouton Précédent, liste devenue vide, panneau d'onglet). Démonté ouvert, son état `open` reste `true` et **il resurgit tout seul** quand la garde revient — et il tenait une couche Radix au moment de disparaître. Le monter sous une garde **stable** (`canManage`) et, si la condition métier tombe, le **fermer par ajustement pendant le rendu** : `if (!editable && dlg.open) dlg.close()`. Même logique pour la `key` : elle ne dépend que de `open` et de l'id d'entité, **jamais d'une donnée de requête ni de l'URL** (`key={liesIds.join(',')}` remontait le dialog en pleine sélection au premier rafraîchissement). Un menu (`DropdownMenu`/`ContextMenu`) dont un item navigue ou ouvre un dialog prend `modal={false}`.

### Reset

Par **remontage** (la `key`), jamais par un `useEffect` de reset : les `defaultValues` sont recalculés au montage.

## 3. Câbler une suppression

```tsx
const del = useConfirmDelete<Site>({
  onDelete: (site) => remove.mutateAsync(site.id),
  successMessage: 'Site supprimé',
})

<ConfirmDeleteDialog
  {...del.dialogProps}
  entityLabel="le site"
  warning="Les bâtiments et niveaux rattachés seront supprimés."
  impacts={blocage?.impacts}
  blocked={blocage?.blocked}
/>
```

- **Nommer l'objet dans le titre** (« Supprimer le site « Tour A » ? »), pas seulement en description.
- **Dire ce que la cascade emporte.** Une FK `RESTRICT` bloque → présenter le blocage et ses causes (`blocked` + `impacts`) plutôt qu'une erreur brute.
- Erreurs via `deleteErrorMessage(e)`.

## 4. Normes de forme

Elles ont été arbitrées écran par écran ; s'en écarter recrée une divergence visible.

| Point                      | Norme                                                   |
| -------------------------- | ------------------------------------------------------- |
| Pied                       | Annuler (`variant="outline"`) à gauche, action à droite |
| Libellé de création        | « Créer » → « Enregistrement… »                         |
| Libellé d'édition          | « Enregistrer » → « Enregistrement… »                   |
| Libellé de suppression     | « Supprimer » → « Suppression… »                        |
| Verbe métier               | garde son propre `pendingLabel` (« Résiliation… »)      |
| `size`                     | selon la densité du contenu, pas selon l'habitude       |
| Description                | facultative, mais alors une phrase complète             |
| Une seule modale à la fois | ne jamais empiler                                       |

**Jamais un `…` nu comme libellé d'attente** : le bouton passe de ~90 à 30 px et la barre d'actions se réarrange sous l'œil de l'utilisateur.

## 5. Modale partageable par lien

Quand la modale doit être atteignable par URL (deep-link depuis une autre section) : `validateSearch` sur la route, sélection pilotée par `Route.useSearch()`, ouverture en `navigate({ search: { … } })`, **fermeture en `navigate({ search: {}, replace: true })`** — sinon le bouton « précédent » rouvre la modale.

## Vérifier avant de conclure

- Ouvrir en création **et** en édition : c'est en édition que le mapping valeur → champ se casse.
- Saisir, annuler, rouvrir : les champs doivent être revenus à l'état enregistré.
- Soumettre avec un champ requis vide : le message vient de `FormMessage`, pas d'un toast.
- Provoquer une erreur backend : elle s'affiche en toast traduit, et **la modale reste ouverte**.
- `npm run verify`.
