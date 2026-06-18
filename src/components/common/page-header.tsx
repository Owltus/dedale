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
 *   3. actions (boutons icône+tooltip) à DROITE du titre (mobile comme bureau) ;
 *      `extra` (contrôle large, ex. ScopeSelect) à droite sur bureau, replié PLEINE
 *      LARGEUR sous le bloc sur mobile.
 * Responsive : l'en-tête tient sur 2 lignes (titre + description) — le fil, le titre
 * et la description TRONQUENT (jamais de 3e ligne) ; sous `sm` le fil ne garde que le
 * parent immédiat. Un seul composant → un changement de mise en forme se répercute
 * sur toutes les pages.
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
    // `flex-wrap` + `order` : sur mobile, le bloc texte et les actions tiennent sur
    // la 1re ligne (les actions, icônes étroites, restent à droite du titre) et
    // l'`extra` (large) se replie pleine largeur sous le bloc ; sur bureau, tout
    // s'aligne sur une seule rangée, centrée verticalement. Pas de duplication.
    <div className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-2 sm:items-center">
      {/* Bloc texte (fil-titre + description). Prend l'espace, rétrécit et TRONQUE
          pour tenir sur 2 lignes max — jamais de 3e ligne. */}
      <div className="order-1 flex min-w-0 flex-1 flex-col gap-1">
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
        {/* Ligne 1 — fil EN TITRE : ancêtres discrets → nœud courant en grand. Une
            seule ligne : les ancêtres et le titre TRONQUENT (pas de retour ligne). */}
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
                    title={c.label}
                    className="text-muted-foreground hover:text-foreground truncate text-sm"
                  >
                    {c.label}
                  </button>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </span>
              ))}
            </nav>
          )}
          <h1
            title={title}
            className="min-w-0 truncate text-2xl font-semibold tracking-tight"
          >
            {title}
          </h1>
          {titleBadges}
        </div>
        {/* Ligne 2 — description : UNE ligne tronquée (survol = texte complet),
            zone TOUJOURS réservée même si vide (`min-h-5`). */}
        <p
          title={description}
          className="text-muted-foreground min-h-5 truncate text-sm"
        >
          {description}
        </p>
      </div>
      {/* Actions (icônes) : restent À DROITE du titre, mobile comme bureau. */}
      {action != null && (
        <div className="order-2 flex shrink-0 items-center gap-1 sm:order-3">
          {action}
        </div>
      )}
      {/* Extra (contrôle large, ex. ScopeSelect) : à droite sur bureau, replié
          PLEINE LARGEUR sous le bloc sur mobile (sa largeur écraserait le titre). */}
      {extra != null && (
        <div className="order-3 w-full sm:order-2 sm:w-auto">{extra}</div>
      )}
    </div>
  )
}
