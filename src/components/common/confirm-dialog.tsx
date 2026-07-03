import type { ReactNode } from 'react'
import { DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { DialogShell } from '@/components/common/dialog-shell'

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
  // La description est rendue dans le CORPS (défilant), pas dans l'en-tête, pour
  // laisser cohabiter un bloc `body` libre (saisie de confirmation…). Sans texte
  // ni bloc, aucun corps n'est rendu (la coquille s'y adapte).
  const hasBody = description != null || body != null
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      bodyClassName="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2"
      footer={
        <>
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
        </>
      }
    >
      {hasBody ? (
        <>
          {description && <DialogDescription>{description}</DialogDescription>}
          {body}
        </>
      ) : undefined}
    </DialogShell>
  )
}
