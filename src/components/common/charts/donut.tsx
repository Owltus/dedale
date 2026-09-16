import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  onKeyActivate,
  toneToken,
  type ChartSegment,
} from '@/components/common/charts/chart-tokens'
import {
  anneauComplet,
  calculerPartsDonut,
  secteurAnnulaire,
} from '@/components/common/charts/geometrie'

interface DonutProps {
  /** Parts du donut ; une part de valeur 0 n'est pas dessinée. */
  segments: ChartSegment[]
  /** Contenu central (grand chiffre + libellé), superposé au trou du donut. */
  centre?: ReactNode
  /** Épaisseur de l'anneau, en unités de la `viewBox` (0-100). */
  epaisseur?: number
  /** Petit espace angulaire entre deux parts, en degrés. */
  gapDeg?: number
  className?: string
}

/**
 * Donut SVG maison, proportionnel et sans dépendance. Parts colorées par les
 * tokens sémantiques (via `tone`), survol → surbrillance de la part + infobulle
 * `label : valeur`, clic → `segment.onClick`. Rien n'est rendu si toutes les
 * valeurs sont nulles (le cadran gère alors sa propre disparition). Toute la
 * géométrie (angles, parts, chemins) vit dans `geometrie.ts`.
 */
export function Donut({
  segments,
  centre,
  epaisseur = 16,
  gapDeg = 2,
  className,
}: DonutProps) {
  const { total, parts } = calculerPartsDonut(segments, gapDeg)
  if (total <= 0) return null

  const cx = 50
  const cy = 50
  const rExt = 46
  const rInt = Math.max(rExt - epaisseur, 2)

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Répartition en anneau"
        className="block w-full"
      >
        {parts.map(({ seg, a0, a1, complet }) => {
          const interactif = Boolean(seg.onClick)
          const infobulle = `${seg.label} : ${String(seg.value)}`
          return (
            <path
              key={seg.key}
              d={
                complet
                  ? anneauComplet(cx, cy, rExt, rInt)
                  : secteurAnnulaire(cx, cy, rExt, rInt, a0, a1)
              }
              // Creuse le trou central de l'anneau complet (deux sous-chemins).
              fillRule={complet ? 'evenodd' : undefined}
              fill={toneToken(seg.tone)}
              className={cn(
                'transition-[filter] outline-none focus-visible:brightness-110',
                interactif && 'cursor-pointer hover:brightness-110',
              )}
              role={interactif ? 'button' : 'img'}
              aria-label={infobulle}
              tabIndex={interactif ? 0 : undefined}
              onClick={seg.onClick}
              onKeyDown={onKeyActivate(seg.onClick)}
            >
              <title>{infobulle}</title>
            </path>
          )
        })}
      </svg>
      {centre != null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          {centre}
        </div>
      )}
    </div>
  )
}
