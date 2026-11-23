import type { ReactNode } from 'react'
import { StatusBadge, type StatusTone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'

/**
 * Colonne de droite à largeur FIXE et centrée — gabarit COMMUN aux cartes de liste
 * porteuses d'un statut (OT, gamme, catégorie, sous-catégorie). Badge de statut EN
 * HAUT + ligne secondaire optionnelle EN DESSOUS (date prévue, périodicité…). La
 * largeur fixe garde badges et métas ALIGNÉS d'une carte à l'autre malgré des
 * libellés de longueurs variables. `statut` absent (chargement, ou carte sans
 * statut) → badge masqué mais la colonne RÉSERVE sa place : pas de décalage quand
 * il apparaît.
 */
export function StatutColonne({
  statut,
  meta,
  dense = false,
  className,
}: {
  /** Statut affiché (libellé + tonalité). Absent → badge masqué (place réservée). */
  statut?: { label: string; tone: StatusTone }
  /** Ligne secondaire sous le badge (date prévue, périodicité…). Masquée si absente. */
  meta?: ReactNode
  /**
   * Variante SERRÉE pour les lignes `size="xs"` (tableau de bord, h-11) : colonne
   * plus étroite, date en petit, sans espace → badge + date tiennent dans la
   * hauteur de la ligne sans l'agrandir.
   */
  dense?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        dense ? 'w-28 gap-0.5' : 'w-36 gap-1',
        className,
      )}
    >
      {statut && (
        <StatusBadge tone={statut.tone} className="shrink-0">
          {statut.label}
        </StatusBadge>
      )}
      {meta != null && (
        <span
          className={cn(
            'text-muted-foreground',
            dense ? 'text-[11px] leading-none' : 'text-sm',
          )}
        >
          {meta}
        </span>
      )}
    </div>
  )
}
