import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { DialogShell } from '@/components/common/dialog-shell'

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
 * Coquille visuelle commune des dialogs de formulaire, en TROIS zones (via
 * `DialogShell`) : en-tête FIXE, corps des champs DÉFILANT, pied Annuler/Valider
 * FIXE. Le corps + le pied sont enveloppés d'un `<form>` (soumission au clavier).
 * Ne gère NI l'état, NI la validation, NI le reset — tout cela reste chez l'appelant.
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
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      contentClassName={contentClassName}
      wrap={(inner) => (
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
          {inner}
        </form>
      )}
      footer={
        <>
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
        </>
      }
    >
      {children}
    </DialogShell>
  )
}
