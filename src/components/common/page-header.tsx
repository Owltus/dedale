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
   * Fil d'Ariane : ancêtres CLIQUABLES rendus PETITS et DISCRETS, qui PRÉCÈDENT le
   * titre courant sur la ligne de tête (le fil tient lieu de titre ; le nœud courant
   * n'y figure pas — c'est le `title`, rendu en grand juste après). Absent ou `[]`
   * (page racine) → titre seul. Repli mobile : seul le parent immédiat est affiché.
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
 * et — via `Tabs` — pages à onglets). Le FIL D'ARIANE tient lieu de titre :
 *   1. ligne de tête = ancêtres PETITS et DISCRETS (cliquables) → nœud courant en
 *      GRAND titre (`text-2xl`) + badges ;
 *   2. description (text-sm muted) JUSTE EN DESSOUS, sur une zone TOUJOURS réservée
 *      (`min-h-5`) même vide → hauteur stable d'une page à l'autre ;
 *   3. zone d'actions (boutons icône+tooltip) + `extra` (contrôle large) à droite,
 *      CENTRÉE verticalement sur le bloc texte (bureau).
 * Responsive : empilement sous `sm`, troncature du titre et des ancêtres (le fil ne
 * garde que le parent immédiat sous `sm`). Un seul composant → un changement de mise
 * en forme se répercute sur toutes les pages.
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
      {/* En-tête : le FIL D'ARIANE tient lieu de titre. Ses ancêtres (petits,
          atténués, cliquables) PRÉCÈDENT le nœud courant rendu en GRAND titre, puis
          la description vient en dessous sur une zone TOUJOURS réservée (`min-h-5`)
          même vide → hauteur stable d'une page à l'autre. */}
      <div className="flex min-w-0 flex-col gap-1">
        {/* Repli « Retour » des états transitoires (chargement/erreur), en tête. */}
        {onBack && !hasCrumbs && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground -ml-2 mb-0.5 h-auto gap-1 px-2 py-1"
          >
            <ChevronLeft className="size-4" />
            {backLabel}
          </Button>
        )}
        {/* Ligne 1 — fil EN TITRE : ancêtres discrets → nœud courant en grand. */}
        <div className="flex min-w-0 items-center gap-1.5">
          {hasCrumbs && (
            <nav
              aria-label="Fil d’Ariane"
              className="flex min-w-0 shrink items-center gap-1.5"
            >
              {breadcrumb.map((c, i) => (
                <span
                  key={i}
                  className={
                    // Sous `sm`, on ne garde que le parent IMMÉDIAT (dernier ancêtre).
                    i < breadcrumb.length - 1
                      ? 'hidden shrink-0 items-center gap-1.5 sm:flex'
                      : 'flex min-w-0 items-center gap-1.5'
                  }
                >
                  <button
                    type="button"
                    onClick={c.onClick}
                    className="text-muted-foreground hover:text-foreground truncate text-sm"
                  >
                    {c.label}
                  </button>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </span>
              ))}
            </nav>
          )}
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          {titleBadges}
        </div>
        {/* Ligne 2 — description : zone TOUJOURS réservée même si vide. */}
        <p className="text-muted-foreground min-h-5 text-sm">{description}</p>
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
