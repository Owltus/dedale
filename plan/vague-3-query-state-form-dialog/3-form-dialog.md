# Étape 3 — Coquille FormDialog

## Objectif

Créer `common/form-dialog.tsx` : la coquille visuelle commune des dialogs de
formulaire (Dialog + header + `<form>` + footer Annuler/Valider), sans gérer
l'état métier (qui reste chez l'appelant).

## Fichier(s) impacté(s)

- `src/components/common/form-dialog.tsx` (nouveau)

## Travail à réaliser

### 1. `form-dialog.tsx`

```tsx
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Validation + soumission (l'appelant fait safeParse + mutation + toast). */
  onSubmit: () => void
  submitLabel: string
  /** Libellé pendant l'envoi (défaut : submitLabel). */
  pendingLabel?: string
  pending: boolean
  submitVariant?: 'default' | 'destructive'
  cancelLabel?: string
  /** Classe sur DialogContent (ex. max-h-[90vh] overflow-y-auto). */
  contentClassName?: string
  /** Les champs du formulaire. */
  children: ReactNode
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  onSubmit,
  submitLabel,
  pendingLabel,
  pending,
  submitVariant = 'default',
  cancelLabel = 'Annuler',
  contentClassName,
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={contentClassName}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit()
          }}
          className="flex flex-col gap-4"
        >
          {children}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" variant={submitVariant} disabled={pending}>
              {pending ? (pendingLabel ?? submitLabel) : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

Notes :

- `onSubmit` est synchrone côté coquille ; l'appelant y branche son
  `handleSubmit` (qui peut être async via `void handleSubmit()`).
- La coquille ne gère NI l'état, NI le reset (inchangé chez l'appelant).
- `contentClassName` couvre le cas `chantier-form-dialog`
  (`max-h-[90vh] overflow-y-auto`).
- `submitVariant="destructive"` couvre `motif-dialog` (mode destructif).

## Critère de validation

- `npx tsc -b` et `npx eslint .` passent.
- `FormDialog` importable via `@/`.
- Aucun dialog migré à cette étape.
