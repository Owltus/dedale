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
import { cn } from '@/lib/utils'

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
  /** Désactive la validation hors envoi (ex. champ requis sans option possible). */
  submitDisabled?: boolean
  submitVariant?: 'default' | 'destructive'
  cancelLabel?: string
  /** Classe additionnelle sur DialogContent (ex. sm:max-w-2xl). */
  contentClassName?: string
  /** Les champs du formulaire. */
  children: ReactNode
}

/**
 * Coquille visuelle commune des dialogs de formulaire, en TROIS zones : en-tête
 * (titre/description) FIXE, corps des champs DÉFILANT, pied Annuler/Valider FIXE.
 * Seul le corps scrolle quand le contenu dépasse → le titre et les boutons
 * restent toujours visibles (hauteur bornée à 85vh). Ne gère NI l'état, NI la
 * validation, NI le reset — tout cela reste chez l'appelant.
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
  submitDisabled = false,
  submitVariant = 'default',
  cancelLabel = 'Annuler',
  contentClassName,
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0',
          contentClassName,
        )}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form
          // FormDialog IMBRIQUÉ (ex. « Ajouter une caractéristique » dans le modal
          // de sous-catégorie) : même affiché dans un portail, le sous-dialogue
          // reste un ENFANT React du <form> parent, et React fait REMONTER
          // l'événement « submit » le long de l'arbre REACT (pas du DOM). Sans
          // stopPropagation, valider le sous-dialogue soumettait AUSSI le
          // formulaire parent (toast + fermeture, saisie perdue). On coupe net.
          onSubmit={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onSubmit()
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* Corps défilant : seuls les champs scrollent. */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-1">
            {children}
          </div>
          <DialogFooter className="shrink-0 px-6 pt-4 pb-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={submitVariant}
              disabled={pending || submitDisabled}
            >
              {pending ? (pendingLabel ?? submitLabel) : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
