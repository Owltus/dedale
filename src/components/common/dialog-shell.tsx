import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** Classe canonique du corps DÉFILANT d'un dialog (espace vertical entre champs). */
export const DIALOG_BODY_CLASS =
  'min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-1'

interface DialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** Rendue dans l'EN-TÊTE fixe, sous le titre (uniquement si fournie). */
  description?: ReactNode
  /** Pied FIXE (boutons Annuler/Valider). Rendu seulement s'il est fourni. */
  footer?: ReactNode
  /** Corps DÉFILANT. Aucun corps rendu s'il est nul (ex. ConfirmDialog sans texte). */
  children?: ReactNode
  /** Classe additionnelle sur `DialogContent` (ex. `sm:max-w-2xl`). */
  contentClassName?: string
  /** Classe du corps défilant (remplace `DIALOG_BODY_CLASS` — ex. sans `space-y-4`). */
  bodyClassName?: string
  /**
   * Enveloppe le corps + le pied (ex. FormDialog : un `<form>` avec preventDefault).
   * Reçoit le corps défilant et le pied DÉJÀ rendus. Défaut : identité.
   */
  wrap?: (inner: ReactNode) => ReactNode
}

/**
 * Coquille commune des dialogs en TROIS zones : en-tête (titre/description) FIXE,
 * corps DÉFILANT, pied FIXE. Seul le corps scrolle quand le contenu dépasse → le
 * titre et les boutons restent visibles (hauteur bornée à 85vh). Ne gère NI état,
 * NI validation — l'appelant compose header/corps/pied. `wrap` permet à FormDialog
 * d'entourer corps+pied d'un `<form>` sans changer le DOM.
 */
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  contentClassName,
  bodyClassName,
  wrap = (inner) => inner,
}: DialogShellProps) {
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
          {description != null && (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>
        {wrap(
          <>
            {children != null && (
              <div className={bodyClassName ?? DIALOG_BODY_CLASS}>
                {children}
              </div>
            )}
            {footer != null && (
              <DialogFooter className="shrink-0 px-6 pt-4 pb-6">
                {footer}
              </DialogFooter>
            )}
          </>,
        )}
      </DialogContent>
    </Dialog>
  )
}
