import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  onKeyActivate,
  toneToken,
  type ChartSegment,
} from '@/components/common/charts/chart-legend'

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

/** Formate une coordonnée SVG (borne la précision). */
const fmt = (v: number) => v.toFixed(2)

/** Coordonnées d'un point sur un cercle ; 0° = haut, sens horaire. */
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

/** Chemin d'un secteur annulaire (part de donut) entre deux angles. */
function secteurAnnulaire(
  cx: number,
  cy: number,
  rExt: number,
  rInt: number,
  a0: number,
  a1: number,
) {
  const grand = a1 - a0 > 180 ? 1 : 0
  const oe0 = polar(cx, cy, rExt, a0)
  const oe1 = polar(cx, cy, rExt, a1)
  const oi1 = polar(cx, cy, rInt, a1)
  const oi0 = polar(cx, cy, rInt, a0)
  return [
    `M${fmt(oe0.x)} ${fmt(oe0.y)}`,
    `A${fmt(rExt)} ${fmt(rExt)} 0 ${String(grand)} 1 ${fmt(oe1.x)} ${fmt(oe1.y)}`,
    `L${fmt(oi1.x)} ${fmt(oi1.y)}`,
    `A${fmt(rInt)} ${fmt(rInt)} 0 ${String(grand)} 0 ${fmt(oi0.x)} ${fmt(oi0.y)}`,
    'Z',
  ].join(' ')
}

/**
 * Donut SVG maison, proportionnel et sans dépendance. Parts colorées par les
 * tokens sémantiques (via `tone`), survol → surbrillance de la part + infobulle
 * `label : valeur`, clic → `segment.onClick`. Rien n'est rendu si toutes les
 * valeurs sont nulles (le cadran gère alors sa propre disparition).
 */
export function Donut({
  segments,
  centre,
  epaisseur = 16,
  gapDeg = 2,
  className,
}: DonutProps) {
  const actifs = segments.filter((s) => s.value > 0)
  const total = actifs.reduce((acc, s) => acc + s.value, 0)
  if (total <= 0) return null

  const cx = 50
  const cy = 50
  const rExt = 46
  const rInt = Math.max(rExt - epaisseur, 2)

  const parts = actifs
    .map((seg, i) => {
      const span = (seg.value / total) * 360
      // Début = somme des parts précédentes (évite toute mutation en rendu).
      const debut = actifs
        .slice(0, i)
        .reduce((acc, s) => acc + (s.value / total) * 360, 0)
      let a0 = debut + gapDeg / 2
      let a1 = debut + span - gapDeg / 2
      // Part unique couvrant tout le cercle : évite le secteur dégénéré (a0=a1).
      if (actifs.length === 1) {
        a0 = 0.0001
        a1 = 359.999
      }
      return { seg, a0, a1 }
    })
    .filter((p) => p.a1 > p.a0)

  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Répartition en anneau"
        className="block w-full"
      >
        {parts.map(({ seg, a0, a1 }) => {
          const interactif = Boolean(seg.onClick)
          const infobulle = `${seg.label} : ${String(seg.value)}`
          return (
            <path
              key={seg.key}
              d={secteurAnnulaire(cx, cy, rExt, rInt, a0, a1)}
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
