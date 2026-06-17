import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface PageHeaderCrumb {
  label: string
  onClick: () => void
}

interface PageHeaderProps {
  title: string
  description?: string
  /** Actions à droite. Convention : boutons ICÔNE + tooltip (`TooltipIconButton`). */
  action?: ReactNode
  /**
   * Fil d'Ariane : ancêtres CLIQUABLES précédant le titre (vue détail) ; le titre
   * courant en est le dernier maillon. Absent ou `[]` sur une page racine (→ titre
   * seul). Emplacement FIXE : toujours la ligne de titre, qu'il y ait un chemin ou non.
   */
  breadcrumb?: PageHeaderCrumb[]
  /** Bouton « Retour » simple (alternative au fil d'Ariane, ex. état transitoire). */
  onBack?: () => void
  backLabel?: string
  /** Badges affichés à côté du titre (ex. statut actif / anonymisé). */
  titleBadges?: ReactNode
}

/**
 * En-tête de page UNIQUE et réutilisable. Liste = titre + description + actions.
 * Détail = fil d'Ariane inline (ancêtres cliquables) → titre courant + badges.
 * Les actions sont des boutons icône (tooltip). Responsive : le titre/fil d'Ariane
 * se replient (flex-wrap, troncature des ancêtres) et l'ensemble s'empile sous `sm`.
 * Un seul composant → un changement de mise en forme impacte toutes les pages.
 */
export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
  onBack,
  backLabel = 'Retour',
  titleBadges,
}: PageHeaderProps) {
  const hasCrumbs = breadcrumb !== undefined && breadcrumb.length > 0
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {onBack && !hasCrumbs && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground -ml-2 mb-1 h-auto gap-1 px-2 py-1"
          >
            <ChevronLeft className="size-4" />
            {backLabel}
          </Button>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {hasCrumbs &&
            breadcrumb.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={c.onClick}
                  className="text-muted-foreground hover:text-foreground max-w-[45vw] shrink-0 truncate text-sm font-medium sm:max-w-[14rem]"
                >
                  {c.label}
                </button>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </span>
            ))}
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {titleBadges}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex shrink-0 items-center gap-1">{action}</div>
      )}
    </div>
  )
}
