import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

/** Classe canonique du corps DÉFILANT d'un dialog (espace vertical entre champs).
 *  `py-2` = respiration haut/bas → le contenu ne colle ni à l'en-tête ni au pied. */
export const DIALOG_BODY_CLASS =
  'min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-2'

/** Corps DÉFILANT sans padding (aperçu plein cadre, canvas, iframe). */
export const DIALOG_BODY_UNPADDED = 'min-h-0 flex-1 overflow-y-auto'

/** Largeurs normalisées de dialog. `full` = quasi plein écran (aperçus). */
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

const SIZE_CLASS: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-6xl',
}

interface DialogShellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** Rendue dans l'EN-TÊTE fixe, sous le titre (uniquement si fournie). */
  description?: ReactNode
  /**
   * Le CORPS fournit lui-même la `DialogDescription` (cf. `ConfirmDialog`, qui
   * la rend dans le corps pour cohabiter avec un bloc libre). La coquille ne
   * pose alors pas le descriptif masqué de repli — sinon deux descriptions
   * partageraient le même id.
   */
  descriptionInBody?: boolean
  /** Largeur normalisée (défaut `md` = `sm:max-w-lg`). Remplace un `contentClassName` de largeur. */
  size?: DialogSize
  /** Padding du corps défilant (défaut vrai). `false` = corps plein cadre. Ignoré si `bodyClassName` fourni. */
  padded?: boolean
  /** Zone d'action à DROITE de l'en-tête (boutons contextuels : aperçu, plein écran…). */
  headerAction?: ReactNode
  /** Filet de séparation sous l'en-tête (défaut false). */
  headerSeparator?: boolean
  /** Filet de séparation au-dessus du pied — ancre la barre d'actions (défaut false). */
  footerSeparator?: boolean
  /** Pied FIXE (boutons Annuler/Valider). Rendu seulement s'il est fourni. */
  footer?: ReactNode
  /** Corps DÉFILANT. Aucun corps rendu s'il est nul (ex. ConfirmDialog sans texte). */
  children?: ReactNode
  /** Classe additionnelle sur `DialogContent` (ex. hauteur sur mesure). */
  contentClassName?: string
  /** Classe du corps défilant (remplace la classe dérivée de `padded`). */
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
 * titre et les boutons restent visibles (hauteur bornée à 85vh, 92vh en `full`).
 * Ne gère NI état, NI validation — l'appelant compose header/corps/pied. `wrap`
 * permet à FormDialog d'entourer corps+pied d'un `<form>` sans changer le DOM.
 *
 * Variantes : `size` (largeur), `padded` (corps plein cadre pour aperçu/canvas),
 * `headerAction` (boutons contextuels dans l'en-tête), `headerSeparator` (filet).
 */
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  descriptionInBody = false,
  size = 'md',
  padded = true,
  headerAction,
  headerSeparator = false,
  footerSeparator = false,
  footer,
  children,
  contentClassName,
  bodyClassName,
  wrap = (inner) => inner,
}: DialogShellProps) {
  const bodyClass =
    bodyClassName ?? (padded ? DIALOG_BODY_CLASS : DIALOG_BODY_UNPADDED)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0',
          size === 'full' && 'max-h-[92vh]',
          SIZE_CLASS[size],
          contentClassName,
        )}
      >
        <DialogHeader className="shrink-0 gap-0 px-6 pt-6 pb-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <DialogTitle>{title}</DialogTitle>
              {description != null ? (
                <DialogDescription>{description}</DialogDescription>
              ) : (
                // Sans `Description`, Radix journalise « Missing `Description`
                // or `aria-describedby={undefined}` » à chaque ouverture. Un
                // descriptif MASQUÉ garde la console propre et donne au
                // lecteur d'écran au moins l'intitulé du dialogue.
                !descriptionInBody && (
                  <DialogDescription className="sr-only">
                    {typeof title === 'string' ? title : 'Boîte de dialogue'}
                  </DialogDescription>
                )
              )}
            </div>
            {headerAction != null && (
              <div className="flex shrink-0 items-center gap-1">
                {headerAction}
              </div>
            )}
          </div>
        </DialogHeader>
        {headerSeparator && <Separator className="shrink-0" />}
        {wrap(
          <>
            {children != null && <div className={bodyClass}>{children}</div>}
            {footer != null && (
              <>
                {footerSeparator && <Separator className="shrink-0" />}
                <DialogFooter className="shrink-0 px-6 pt-4 pb-6">
                  {footer}
                </DialogFooter>
              </>
            )}
          </>,
        )}
      </DialogContent>
    </Dialog>
  )
}
