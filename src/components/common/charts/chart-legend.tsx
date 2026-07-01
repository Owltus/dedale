import type { KeyboardEvent } from 'react'
import type { StatusTone } from '@/components/common/status-badge'
import { cn } from '@/lib/utils'

/**
 * Segment générique de graphique, partagé par toutes les primitives de dataviz
 * (donut, barres empilées). Le `tone` porte la couleur sémantique (mappée vers
 * un token via {@link toneToken}) ; `value` est la grandeur brute, `label` le
 * libellé lisible, `onClick` l'action de forage optionnelle.
 */
export interface ChartSegment {
  key: string
  label: string
  value: number
  tone: StatusTone
  onClick?: () => void
}

/**
 * Variable CSS de token pour chaque tonalité — sert de `fill`/`stroke` aux SVG
 * et de couleur de pastille à la légende. AUCUNE couleur en dur : on renvoie la
 * variable sémantique définie dans `src/index.css`. `neutral` prend
 * `--muted-foreground` (gris visible) plutôt que `--muted` (quasi blanc), pour
 * rester lisible sur une part de graphique.
 */
export const TONE_VAR: Record<StatusTone, string> = {
  neutral: 'var(--muted-foreground)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  info: 'var(--info)',
  violet: 'var(--violet)',
  yellow: 'var(--yellow)',
}

/** Couleur de token d'une tonalité, à passer directement à `fill`/`stroke`. */
export function toneToken(tone: StatusTone): string {
  return TONE_VAR[tone]
}

/**
 * Libellé français par défaut d'une tonalité, pour les infobulles génériques
 * (« Famille X · À surveiller »). Le parent qui connaît son métier peut toujours
 * enrichir le `label` du nœud ; ces valeurs ne sont qu'un repli sémantique.
 */
export const TONE_LABEL: Record<StatusTone, string> = {
  neutral: 'Neutre',
  success: 'Bon',
  warning: 'À surveiller',
  destructive: 'Critique',
  info: 'Information',
  violet: 'Planifié',
  yellow: 'Vigilance',
}

/**
 * Fabrique un gestionnaire clavier « activation » (Entrée / Espace) pour rendre
 * un élément SVG interactif accessible au clavier. Mutualisé par les primitives.
 */
export function onKeyActivate(cb?: () => void) {
  return (e: KeyboardEvent) => {
    if (!cb) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      cb()
    }
  }
}

export interface ChartLegendItem {
  label: string
  tone: StatusTone
}

/**
 * Légende horizontale réutilisable : une pastille colorée par le token de la
 * tonalité + son libellé. Employée sous le donut, les barres et la frise. La
 * couleur de la pastille est STRICTEMENT celle des segments correspondants
 * (même {@link toneToken}), pour une lecture cohérente graphique ↔ légende.
 */
export function ChartLegend({
  items,
  className,
}: {
  items: ChartLegendItem[]
  className?: string
}) {
  if (items.length === 0) return null
  return (
    <ul
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}
    >
      {items.map((item, i) => (
        <li
          key={`${item.tone}-${item.label}-${String(i)}`}
          className="text-muted-foreground flex items-center gap-1.5 text-xs"
        >
          <span
            aria-hidden
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: toneToken(item.tone) }}
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
