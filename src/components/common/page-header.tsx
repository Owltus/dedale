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
   * Contrôle LARGE à droite (ex. `ScopeSelect`). À droite des actions en bureau,
   * replié pleine largeur sous l'en-tête en mobile.
   */
  extra?: ReactNode
  /**
   * Fil d'Ariane : ancêtres CLIQUABLES rendus sur une ligne PETITE et DISCRÈTE
   * AU-DESSUS du titre (le titre courant n'y figure pas — il EST le titre). Absent
   * ou `[]` (page racine) → pas de ligne de chemin. Repli mobile : parent immédiat.
   */
  breadcrumb?: PageHeaderCrumb[]
  /** Bouton « Retour » simple (repli des états transitoires : chargement/erreur). */
  onBack?: () => void
  backLabel?: string
  /** Badges affichés à côté du titre (ex. statut actif / anonymisé / type). */
  titleBadges?: ReactNode
}

/**
 * En-tête de page UNIQUE et réutilisable (pages simples, explorateurs à paliers,
 * et — via `Tabs` — pages à onglets). Mise en forme standard :
 *   1. fil d'Ariane PETIT et DISCRET sur sa propre ligne AU-DESSUS (text-sm muted) ;
 *   2. titre TOUJOURS grand (`text-2xl`) quel que soit le palier ;
 *   3. description optionnelle (text-sm muted) ;
 *   4. zone d'actions (boutons icône+tooltip) + `extra` (contrôle large) à droite.
 * Responsive : empilement sous `sm`, troncature du titre et des ancêtres (le fil
 * ne garde que le parent immédiat sous `sm`). Un seul composant → un changement de
 * mise en forme se répercute sur toutes les pages.
 */
export function PageHeader({
  title,
  description,
  action,
  extra,
  breadcrumb,
  onBack,
  backLabel = 'Retour',
  titleBadges,
}: PageHeaderProps) {
  const hasCrumbs = breadcrumb !== undefined && breadcrumb.length > 0
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {/* Fil d'Ariane discret au-dessus du titre (descente / détail seulement). */}
        {hasCrumbs && (
          <nav
            aria-label="Fil d’Ariane"
            className="text-muted-foreground mb-1 flex min-w-0 items-center gap-1 text-sm"
          >
            {breadcrumb.map((c, i) => (
              <span
                key={i}
                className={
                  // Sous `sm`, on ne garde que le parent IMMÉDIAT (dernier ancêtre).
                  i < breadcrumb.length - 1
                    ? 'hidden min-w-0 items-center gap-1 sm:flex'
                    : 'flex min-w-0 items-center gap-1'
                }
              >
                <button
                  type="button"
                  onClick={c.onClick}
                  className="hover:text-foreground truncate"
                >
                  {c.label}
                </button>
                {/* Chevron ENTRE les maillons seulement : pas de chevron pendant
                    après le dernier ancêtre (le titre vit sur la ligne en dessous). */}
                {i < breadcrumb.length - 1 && (
                  <ChevronRight className="size-3.5 shrink-0" />
                )}
              </span>
            ))}
          </nav>
        )}
        {/* Repli simple « Retour » pour les états transitoires sans fil d'Ariane. */}
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
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {titleBadges}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {(action != null || extra != null) && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {extra}
          {action && <div className="flex items-center gap-1">{action}</div>}
        </div>
      )}
    </div>
  )
}
