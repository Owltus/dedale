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

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
  loading?: boolean
  /** Désactive le bouton de confirmation (ex. action interdite en l'état). */
  confirmDisabled?: boolean
  /** Contenu BLOC optionnel sous la description (ex. champ de confirmation par
   *  saisie). Rendu hors du `<p>` de la description (mise en page libre). */
  body?: ReactNode
  onConfirm: () => void
}

/** Boîte de confirmation réutilisable (suppression, action sensible…). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmer',
  destructive = false,
  loading = false,
  confirmDisabled = false,
  body,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {(description != null || body != null) && (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2">
            {description && <DialogDescription>{description}</DialogDescription>}
            {body}
          </div>
        )}
        <DialogFooter className="shrink-0 px-6 pt-4 pb-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Annuler
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
          >
            {loading ? '…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
