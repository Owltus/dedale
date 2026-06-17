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
   * EN BAS du bloc (sous le titre et la description) — le titre courant n'y figure
   * pas, il EST le titre. Absent ou `[]` (page racine) → pas de ligne de chemin.
   * Repli mobile : parent immédiat.
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
 * et — via `Tabs` — pages à onglets). Mise en forme standard (hiérarchie
 * descendante) :
 *   1. titre TOUJOURS grand (`text-2xl`) + badges, EN HAUT ;
 *   2. description optionnelle (text-sm muted) ;
 *   3. fil d'Ariane PETIT et DISCRET sur sa propre ligne EN BAS (text-sm muted) ;
 *   4. zone d'actions (boutons icône+tooltip) + `extra` (contrôle large) à droite,
 *      CENTRÉE verticalement sur le bloc texte (bureau).
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        {/* Repli simple « Retour » pour les états transitoires sans fil d'Ariane :
            vrai bouton de navigation, reste EN HAUT (≠ le fil discret, en bas). */}
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
        {/* Titre TOUJOURS grand + badges, en HAUT du bloc. */}
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {titleBadges}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
        {/* Fil d'Ariane discret EN BAS, sous le titre et la description (descente /
            détail seulement). Hiérarchie descendante : titre → description → chemin. */}
        {hasCrumbs && (
          <nav
            aria-label="Fil d’Ariane"
            className="text-muted-foreground mt-1.5 flex min-w-0 items-center gap-1 text-sm"
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
                {/* Chevron ENTRE les maillons seulement (pas après le dernier). */}
                {i < breadcrumb.length - 1 && (
                  <ChevronRight className="size-3.5 shrink-0" />
                )}
              </span>
            ))}
          </nav>
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
