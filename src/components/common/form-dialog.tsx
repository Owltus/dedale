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
  /** Soumission : l'appelant fait safeParse + mutation + toast. */
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

/**
 * Coquille visuelle commune des dialogs de formulaire : Dialog + en-tête
 * (titre/description) + `<form>` + pied Annuler/Valider (avec état `pending`).
 * Ne gère NI l'état, NI la validation, NI le reset — tout cela reste chez
 * l'appelant.
 */
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
