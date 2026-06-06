# Étape 4 — Migration des dialogs

## Objectif

Remplacer la coquille recopiée (Dialog + header + form + footer) par
`<FormDialog>` dans les dialogs, en conservant à l'identique l'état, la
validation Zod, les mutations, les toasts et le reset.

## Fichier(s) impacté(s)

Form-dialogs CRUD :

- `src/features/gammes/components/gamme-form-dialog.tsx`
- `src/features/gammes/components/operation-form-dialog.tsx` (champs conditionnels)
- `src/features/equipements/components/equipement-form-dialog.tsx`
- `src/features/equipements/components/instancier-dialog.tsx` (sans Zod)
- `src/features/demandes/components/di-form-dialog.tsx` (cascade modèle)
- `src/features/observations/components/observation-form-dialog.tsx` (champ conditionnel)
- `src/features/investissements/components/investissement-form-dialog.tsx`
- `src/features/sites/components/site-form-dialog.tsx`
- `src/features/prestataires/components/prestataire-form-dialog.tsx`
- `src/features/prestataires/components/contrat-form-dialog.tsx`
- `src/features/localisations/components/batiment-form-dialog.tsx`
- `src/features/localisations/components/niveau-form-dialog.tsx`
- `src/features/localisations/components/local-form-dialog.tsx`
- `src/features/chantiers/components/chantier-form-dialog.tsx` (contentClassName)
- `src/features/utilisateurs/components/invite-user-dialog.tsx` (checkboxes)
- `src/features/documents/components/upload-document-dialog.tsx` (sans Zod, file)

Dialogs d'action :

- `src/features/ordres-travail/components/motif-dialog.tsx` (submitVariant)
- `src/features/ordres-travail/components/ot-create-dialog.tsx`
- `src/features/chantiers/components/cloture-dialog.tsx`
- `src/features/demandes/components/di-resolve-dialog.tsx`
- `src/features/observations/components/observation-lever-dialog.tsx`

## Travail à réaliser

### 1. Schéma de remplacement

Avant :

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{isEdit ? 'Modifier' : 'Nouveau'}</DialogTitle>
      <DialogDescription>…</DialogDescription>
    </DialogHeader>
    <form onSubmit={(e) => { e.preventDefault(); void handleSubmit() }} className="flex flex-col gap-4">
      {/* champs */}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Annuler</Button>
        <Button type="submit" disabled={pending}>{pending ? 'Enregistrement…' : 'Enregistrer'}</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

Après :

```tsx
<FormDialog
  open={open}
  onOpenChange={onOpenChange}
  title={isEdit ? 'Modifier' : 'Nouveau'}
  description="…"
  onSubmit={() => void handleSubmit()}
  submitLabel="Enregistrer"
  pendingLabel="Enregistrement…"
  pending={pending}
>
  {/* champs inchangés */}
</FormDialog>
```

Règles :

- **Reprendre EXACTEMENT** : titre (conditionnel edit/create), description,
  libellés Valider/pending (« Créer »/« Création… », « Inviter », « Clôturer »,
  « Lever », « Résoudre », « Ajouter »…), variante destructive (`motif`).
- `chantier-form-dialog` : passer `contentClassName="max-h-[90vh] overflow-y-auto"`.
- Le `handleSubmit`, l'état (`values`/`errors`), les mutations, les toasts et le
  **mécanisme de reset** (clé/remount par le parent) restent INCHANGÉS.
- Champs conditionnels (`operation`, `observation`), cascade (`di`), checkboxes
  (`invite-user`), upload de fichier (`upload-document`), logique d'instanciation
  (`instancier`) : ce sont les `children` — inchangés, on n'enveloppe que la
  coquille.
- `motif-dialog` est déjà paramétré (title/description/confirmLabel/destructive) :
  l'adapter à FormDialog en mappant ses props.
- Retirer les imports devenus inutiles (`Dialog*`, `Button` si plus utilisé,
  `DialogFooter`…) ; garder ceux encore référencés.

### 2. Cas à exclure / signaler

Si un dialog ne rentre pas proprement (structure trop éloignée, footer multiple,
contenu hors `<form>`…), le LAISSER tel quel et le signaler plutôt que forcer.

## Critère de validation

- `npx tsc -b`, `npx eslint .`, `npx vite build` passent.
- Comportement identique : ouverture/fermeture, validation Zod (mêmes messages),
  champs requis, cascades/conditions, mutations + invalidations, toasts succès/
  erreur, reset à la réouverture.
- Plus de coquille Dialog+footer recopiée dans les dialogs migrés (vérifier qu'il
  ne reste que `FormDialog` + champs).
