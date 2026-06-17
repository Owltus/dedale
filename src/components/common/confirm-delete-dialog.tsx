import type { ReactNode } from 'react'
import { ConfirmDialog } from './confirm-dialog'

interface ConfirmDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Désignation lisible de l'entité : « la vignette », « la catégorie « CVC » ». */
  entityLabel: string
  /**
   * Suppression INTERDITE : on affiche la raison et le bouton est désactivé.
   * Prioritaire sur les impacts (un blocage n'a pas besoin d'avertissement).
   */
  blocked?: boolean
  blockedReason?: ReactNode
  /** Vrai tant que les éléments liés se chargent (query conditionnelle). */
  loadingImpacts?: boolean
  /** Intro de la liste d'impacts (ex. « Cette image est utilisée par 3 éléments : »). */
  impactsTitle?: ReactNode
  /** Éléments liés, affichés en liste (tronquée à 5 + « et N autre(s) »). */
  impacts?: string[]
  /** Avertissement quand la suppression est permise malgré des impacts. */
  warning?: ReactNode
  /** Libellé du bouton de confirmation (défaut « Supprimer »). */
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
}

const APERCU_MAX = 5

/**
 * Dialogue de suppression « impact-aware », commun à toute l'app. Composé sur
 * `ConfirmDialog` : il ne fait que mettre en forme le CONTENU (impacts, blocage,
 * avertissement) — aucune logique de données ni appel réseau. Le consommateur
 * calcule `blocked`/`impacts` (depuis le cache ou une query conditionnelle) et
 * fournit `onConfirm`. Les suppressions étant DÉFINITIVES (hard-delete), ce modal
 * explique en amont ce qui est lié et ce qui va se passer.
 *
 * NB : le contenu est rendu dans le <p> de DialogDescription → uniquement des
 * <span> (contenu phrasé valide), jamais de <ul>/<div>.
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  entityLabel,
  blocked = false,
  blockedReason,
  loadingImpacts = false,
  impactsTitle,
  impacts,
  warning,
  confirmLabel = 'Supprimer',
  loading = false,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  const apercu = impacts?.slice(0, APERCU_MAX) ?? []
  const reste = (impacts?.length ?? 0) - apercu.length

  const description: ReactNode = loadingImpacts ? (
    <span className="text-muted-foreground">Vérification des éléments liés…</span>
  ) : blocked ? (
    <span className="text-destructive">{blockedReason}</span>
  ) : (
    <span className="grid gap-3">
      {apercu.length > 0 && (
        <span className="grid gap-1">
          {impactsTitle != null && <span>{impactsTitle}</span>}
          <span className="grid gap-0.5 pl-1">
            {apercu.map((item, i) => (
              <span key={i} className="block">
                • {item}
              </span>
            ))}
            {reste > 0 && (
              <span className="text-muted-foreground block">
                • et {reste} autre{reste > 1 ? 's' : ''}
              </span>
            )}
          </span>
        </span>
      )}
      {warning != null && <span className="block">{warning}</span>}
    </span>
  )

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Supprimer ${entityLabel} ?`}
      description={description}
      confirmLabel={confirmLabel}
      destructive
      loading={loading}
      confirmDisabled={blocked}
      onConfirm={onConfirm}
    />
  )
}
