import { useId } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ListRowProps {
  /** Icône de tête (ex. `<Folder className="size-5" />`). Optionnelle. */
  icon?: ReactNode
  /**
   * Vignette de tête COLLÉE au bord gauche, CARRÉE, pleine hauteur (sans marge ni
   * padding de son côté). Active une card à HAUTEUR FIXE (indépendante du
   * contenu). Prime sur `icon`.
   */
  media?: ReactNode
  /** Titre principal (tronqué). Sert de nom accessible à la ligne cliquable. */
  title: ReactNode
  /** Sous-titre atténué sous le titre (tronqué). */
  subtitle?: ReactNode
  /** Badges alignés à droite (masqués sous `sm` pour le mobile-first). */
  badges?: ReactNode
  /** Métadonnée textuelle alignée à droite (masquée sous `sm`). */
  meta?: ReactNode
  /** Actions (boutons icône). Un clic dessus ne déclenche pas `onClick`. */
  actions?: ReactNode
  /** Rend toute la ligne cliquable (drill-down) ; ajoute un chevron en fin. */
  onClick?: () => void
  /** Masque le chevron de fin même si la ligne est cliquable (card épurée). */
  hideChevron?: boolean
  /** Surcharge le nom accessible de la ligne cliquable (défaut : le titre visible). */
  titleLabel?: string
  className?: string
}

/**
 * Ligne de liste générique, pleine largeur, à colonnes alignées (« tableau en
 * cartes ») : `[icône?] [titre + sous-titre?] [badges?] [méta?] [actions?]
 * [chevron si cliquable]`. Aucune logique métier → réutilisable partout, à
 * empiler via `listStack` (`src/lib/responsive.ts`).
 *
 * Cliquable : un vrai `<button>` ÉTIRÉ en overlay (`absolute inset-0`) porte
 * l'action — clavier natif (Entrée/Espace), focus visible sur toute la ligne, et
 * surtout AUCUN élément interactif imbriqué. Les actions, posées au-dessus
 * (`z-10`), restent donc indépendantes du drill-down sans `stopPropagation`.
 */
export function ListRow({
  icon,
  media,
  title,
  subtitle,
  badges,
  meta,
  actions,
  onClick,
  hideChevron,
  titleLabel,
  className,
}: ListRowProps) {
  const clickable = onClick !== undefined
  // Nom accessible du bouton overlay = le TITRE VISIBLE (source unique via
  // `aria-labelledby`), pour ne pas dédoubler l'annonce au lecteur d'écran.
  // `titleLabel` reste une surcharge optionnelle (titre non textuel, etc.).
  const titleId = useId()

  // Variante MÉDIA : vignette carrée collée au bord gauche (sans marge ni
  // padding), pleine hauteur ; card à HAUTEUR FIXE. Titre tronqué (1 ligne),
  // sous-titre tronqué proprement (2 lignes max). `overflow-hidden` rogne la
  // vignette aux coins arrondis → l'anneau de focus passe en `ring-inset`.
  if (media !== undefined) {
    return (
      <div
        className={cn(
          'bg-card relative flex h-16 items-stretch overflow-hidden rounded-lg border',
          clickable && 'hover:bg-accent/40 transition-colors',
          className,
        )}
      >
        {clickable && (
          <button
            type="button"
            onClick={onClick}
            aria-labelledby={titleLabel === undefined ? titleId : undefined}
            aria-label={titleLabel}
            className="focus-visible:ring-ring/50 absolute inset-0 focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset"
          />
        )}
        <div className="aspect-square h-full shrink-0">{media}</div>
        <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <div id={titleId} className="truncate font-medium">
              {title}
            </div>
            {subtitle !== undefined && (
              <div className="text-muted-foreground line-clamp-2 text-sm">
                {subtitle}
              </div>
            )}
          </div>
          {badges !== undefined && (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              {badges}
            </div>
          )}
          {meta !== undefined && (
            <div className="text-muted-foreground hidden shrink-0 text-sm sm:block">
              {meta}
            </div>
          )}
          {actions !== undefined && (
            <div className="relative z-10 flex shrink-0 items-center gap-1">
              {actions}
            </div>
          )}
          {clickable && !hideChevron && (
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-card relative flex items-center gap-3 rounded-lg border px-4 py-3',
        clickable && 'hover:bg-accent/40 transition-colors',
        className,
      )}
    >
      {clickable && (
        <button
          type="button"
          onClick={onClick}
          aria-labelledby={titleLabel === undefined ? titleId : undefined}
          aria-label={titleLabel}
          className="focus-visible:ring-ring/50 absolute inset-0 rounded-lg focus-visible:ring-[3px] focus-visible:outline-none"
        />
      )}
      {icon !== undefined && (
        <span className="text-muted-foreground shrink-0">{icon}</span>
      )}
      <div className="min-w-0 flex-1">
        <div id={titleId} className="truncate font-medium">
          {title}
        </div>
        {subtitle !== undefined && (
          <div className="text-muted-foreground line-clamp-2 text-sm">
            {subtitle}
          </div>
        )}
      </div>
      {badges !== undefined && (
        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {badges}
        </div>
      )}
      {meta !== undefined && (
        <div className="text-muted-foreground hidden shrink-0 text-sm sm:block">
          {meta}
        </div>
      )}
      {actions !== undefined && (
        <div className="relative z-10 flex shrink-0 items-center gap-1">
          {actions}
        </div>
      )}
      {clickable && !hideChevron && (
        <ChevronRight className="text-muted-foreground size-4 shrink-0" />
      )}
    </div>
  )
}
