import { useId } from 'react'
import type { ReactNode } from 'react'
import {
  RowContextMenuContent,
  type RowAction,
} from '@/components/common/row-actions'
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
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
  /**
   * Repli MOBILE de l'information clé (portée Commun/Site, type/seuils…) : affichée
   * SOUS le titre et UNIQUEMENT sous `sm`, là où `badges`/`meta` (colonne de droite)
   * sont masqués — pour ne pas perdre l'info discriminante sur petit écran. OPT-IN :
   * sans ce prop, le rendu mobile est inchangé. Variante média (hauteur fixe selon
   * `size`) : REMPLACE le sous-titre sous `sm`. Variante standard : s'AJOUTE sous le sous-titre.
   */
  mobileMeta?: ReactNode
  /**
   * Actions (boutons icône) — ANCIEN mode. Un clic dessus ne déclenche pas
   * `onClick`. Révélées au survol. Conservé pour les pages non encore migrées ;
   * remplacé à terme par `menuActions`.
   */
  actions?: ReactNode
  /**
   * Actions présentées en MENU : clic droit / appui long sur la card ouvrent un
   * menu contextuel, et un kebab « ⋮ » (révélé au survol / permanent au tactile)
   * ouvre le même menu. Prime sur `actions`. La page filtre selon les permissions.
   */
  menuActions?: RowAction[]
  /** Rend toute la ligne cliquable (drill-down). */
  onClick?: () => void
  /** Surcharge le nom accessible de la ligne cliquable (défaut : le titre visible). */
  titleLabel?: string
  /**
   * Densité (hauteur) de la carte, cadrée par le composant pour rester homogène :
   * `'md'` par défaut (variante média `h-20`, standard `py-3`), `'sm'` plus
   * compacte, `'lg'` plus aérée. La vignette média suit (`h-full`).
   */
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// Hauteur de la carte média / padding vertical de la carte standard, par densité.
const MEDIA_HEIGHT: Record<NonNullable<ListRowProps['size']>, string> = {
  sm: 'h-14',
  md: 'h-20',
  lg: 'h-24',
}
const ROW_PADDING: Record<NonNullable<ListRowProps['size']>, string> = {
  sm: 'py-1.5',
  md: 'py-3',
  lg: 'py-4',
}

/**
 * Ligne de liste générique, pleine largeur, à colonnes alignées (« tableau en
 * cartes ») : `[icône?] [titre + sous-titre?] [badges?] [méta?] [actions?]`.
 * Aucune logique métier → réutilisable partout, à empiler via `listStack`
 * (`src/lib/responsive.ts`).
 *
 * Cliquable : un vrai `<button>` ÉTIRÉ en overlay (`absolute inset-0`) porte
 * l'action — clavier natif (Entrée/Espace), focus visible sur toute la ligne, et
 * surtout AUCUN élément interactif imbriqué. Les actions, posées au-dessus
 * (`z-10`), restent donc indépendantes du drill-down sans `stopPropagation`.
 *
 * Menu : si `menuActions` est fourni, la card devient déclencheur d'un menu
 * contextuel (clic droit / appui long) et le slot d'actions porte un kebab « ⋮ »
 * (le clic droit n'ouvre PAS le drill-down — qui ne réagit qu'au clic gauche).
 */
export function ListRow({
  icon,
  media,
  title,
  subtitle,
  badges,
  meta,
  mobileMeta,
  actions,
  menuActions,
  onClick,
  titleLabel,
  size = 'md',
  className,
}: ListRowProps) {
  const clickable = onClick !== undefined
  // Nom accessible du bouton overlay = le TITRE VISIBLE (source unique via
  // `aria-labelledby`), pour ne pas dédoubler l'annonce au lecteur d'écran.
  // `titleLabel` reste une surcharge optionnelle (titre non textuel, etc.).
  const titleId = useId()

  const hasMenu = menuActions !== undefined && menuActions.length > 0
  // `menuActions` s'ouvre UNIQUEMENT au clic droit / appui long — AUCUN bouton
  // déclencheur visible (kebab retiré, choix PO). Le slot d'actions ne sert plus
  // qu'à l'ancien prop `actions` (sous-listes/éditeurs non migrés).
  const showActionsSlot = actions !== undefined

  let card: ReactNode

  // Variante MÉDIA : vignette carrée collée au bord gauche (sans marge ni
  // padding), pleine hauteur ; card à HAUTEUR FIXE. Titre tronqué (1 ligne),
  // sous-titre tronqué proprement (1 ligne, toujours réservé pour une mise en
  // page stable). `overflow-hidden` rogne la
  // vignette aux coins arrondis → l'anneau de focus passe en `ring-inset`.
  if (media !== undefined) {
    card = (
      <div
        className={cn(
          'bg-card group relative flex items-stretch overflow-hidden rounded-lg border',
          MEDIA_HEIGHT[size],
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
            {/* Ligne de description TOUJOURS présente (espace insécable si vide) →
                titre et description à position STABLE, qu'il y ait une description
                ou non. Tronquée sur UNE seule ligne. */}
            <div
              className={cn(
                'text-muted-foreground truncate text-sm',
                // `mobileMeta` fourni → on masque la description sous `sm` pour
                // libérer la place à l'info clé sans casser la hauteur fixe.
                mobileMeta !== undefined && 'hidden sm:block',
              )}
            >
              {subtitle ?? ' '}
            </div>
            {/* Repli mobile : info clé sous le titre (sous `sm` uniquement). */}
            {mobileMeta !== undefined && (
              <div className="text-muted-foreground truncate text-xs sm:hidden">
                {mobileMeta}
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
          {showActionsSlot && (
            <div className="relative z-10 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              {actions}
            </div>
          )}
        </div>
      </div>
    )
  } else {
    card = (
      <div
        className={cn(
          'bg-card group relative flex items-center gap-3 rounded-lg border px-4',
          ROW_PADDING[size],
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
          {/* Repli mobile : info clé (portée, type/seuils…) sous le sous-titre,
              uniquement sous `sm` où `badges`/`meta` à droite sont masqués. */}
          {mobileMeta !== undefined && (
            <div className="text-muted-foreground truncate text-xs sm:hidden">
              {mobileMeta}
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
        {showActionsSlot && (
          <div className="relative z-10 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            {actions}
          </div>
        )}
      </div>
    )
  }

  // Menu contextuel : la card devient déclencheur (clic droit + appui long).
  // Le clic GAUCHE conserve le drill-down (le bouton overlay ne réagit pas au
  // bouton droit), et le kebab reste accessible au clic.
  if (hasMenu) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
        <RowContextMenuContent actions={menuActions} />
      </ContextMenu>
    )
  }

  return card
}
