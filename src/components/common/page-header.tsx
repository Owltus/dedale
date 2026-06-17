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
 * et — via `Tabs` — pages à onglets). Gabarit RIGIDE à 3 lignes de hauteur
 * CONSTANTE (emplacements description et fil toujours réservés, même vides) :
 *   1. titre TOUJOURS grand (`text-2xl`) + badges, EN HAUT ;
 *   2. description (text-sm muted) — emplacement réservé ;
 *   3. fil d'Ariane PETIT et DISCRET (text-sm muted) — emplacement réservé EN BAS ;
 *   4. zone d'actions (boutons icône+tooltip) + `extra` (contrôle large) à droite,
 *      CENTRÉE verticalement sur le bloc texte (bureau).
 * Hauteur stable d'une page à l'autre. Responsive : empilement sous `sm`, troncature
 * du titre et des ancêtres (le fil ne garde que le parent immédiat sous `sm`). Un
 * seul composant → un changement de mise en forme se répercute sur toutes les pages.
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
      {/* Gabarit RIGIDE à 3 lignes (hauteur constante) : titre, description, fil
          d'Ariane. Les emplacements description et fil sont TOUJOURS réservés
          (`min-h-5`) même vides, pour que l'en-tête garde la même structure et la
          même hauteur d'une page à l'autre (peu importe qu'il y ait un fil ou non). */}
      <div className="flex min-w-0 flex-col gap-1">
        {/* Repli « Retour » des états transitoires (chargement/erreur), en tête. */}
        {onBack && !hasCrumbs && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground -ml-2 h-auto gap-1 px-2 py-1"
          >
            <ChevronLeft className="size-4" />
            {backLabel}
          </Button>
        )}
        {/* Ligne 1 — titre TOUJOURS grand + badges. */}
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {titleBadges}
        </div>
        {/* Ligne 2 — description (emplacement réservé même si absente). */}
        <p className="text-muted-foreground min-h-5 text-sm">{description}</p>
        {/* Ligne 3 — fil d'Ariane (emplacement réservé même si absent). */}
        <div className="min-h-5">
          {hasCrumbs && (
            <nav
              aria-label="Fil d’Ariane"
              className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm"
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
