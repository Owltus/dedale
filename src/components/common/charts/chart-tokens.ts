import type { KeyboardEvent } from 'react'
import type { StatusTone } from '@/components/common/status-badge'

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
  /**
   * Groupe visuel optionnel : deux parts ADJACENTES partageant le même `group`
   * (non vide) sont dessinées COLLÉES (sans espace angulaire) par le donut — elles
   * se lisent alors comme une seule section, subdivisée. Les frontières entre
   * groupes différents (ou sans groupe) gardent l'espace normal. Ignoré par les
   * primitives qui ne regroupent pas (barres empilées).
   */
  group?: string
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
