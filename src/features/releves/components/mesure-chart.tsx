import { useId, useMemo } from 'react'
import type { MesurePoint } from '../queries'

interface MesureChartProps {
  points: MesurePoint[]
  seuilMin: number | null
  seuilMax: number | null
  uniteSymbole: string | null
  onPointClick?: (point: MesurePoint) => void
}

const W = 720
const H = 240
const PAD = { top: 16, right: 16, bottom: 28, left: 44 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

function formatDateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

/**
 * Graphique linéaire SVG fait main (aucune dépendance externe).
 *
 * Axe horizontal = temps (date d'exécution), axe vertical = valeur mesurée.
 * Trace les seuils min/max en lignes horizontales s'ils sont définis.
 * L'échelle Y englobe valeurs ET seuils, avec une petite marge.
 */
export function MesureChart({
  points,
  seuilMin,
  seuilMax,
  uniteSymbole,
  onPointClick,
}: MesureChartProps) {
  const gradId = useId()

  const model = useMemo(() => {
    const premier = points[0]
    const dernier = points[points.length - 1]
    if (!premier || !dernier) return null
    const valeurs = points.map((p) => p.valeur)
    const bornes = [
      ...valeurs,
      ...(seuilMin !== null ? [seuilMin] : []),
      ...(seuilMax !== null ? [seuilMax] : []),
    ]
    let yMin = Math.min(...bornes)
    let yMax = Math.max(...bornes)
    if (yMin === yMax) {
      // Série plate : on ouvre une fenêtre autour de la valeur.
      const delta = Math.abs(yMin) || 1
      yMin -= delta
      yMax += delta
    }
    const marge = (yMax - yMin) * 0.08
    yMin -= marge
    yMax += marge

    const tMin = new Date(premier.date).getTime()
    const tMaxRaw = new Date(dernier.date).getTime()
    const tMax = tMaxRaw === tMin ? tMin + 1 : tMaxRaw

    const x = (iso: string) =>
      PAD.left + ((new Date(iso).getTime() - tMin) / (tMax - tMin)) * PLOT_W
    const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * PLOT_H

    const coords = points.map((p) => ({
      point: p,
      cx: x(p.date),
      cy: y(p.valeur),
    }))
    const ligne = coords.map((c) => `${String(c.cx)},${String(c.cy)}`).join(' ')

    const baseY = PAD.top + PLOT_H
    const aire = `${String(PAD.left)},${String(baseY)} ${ligne} ${String(W - PAD.right)},${String(baseY)}`
    return { yMin, yMax, x, y, coords, ligne, aire, premier, dernier }
  }, [points, seuilMin, seuilMax])

  const labelY = (v: number) => {
    const arrondi =
      Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100
    return String(arrondi)
  }

  if (!model) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Pas de relevé à tracer.
      </p>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      className="text-muted-foreground h-auto w-full"
      role="img"
      aria-label="Courbe des relevés dans le temps"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Cadre du plot */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={PLOT_W}
        height={PLOT_H}
        className="fill-card stroke-border"
        strokeWidth={1}
      />

      {/* Graduations Y (min/max) */}
      {[model.yMax, model.yMin].map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={model.y(v)}
            y2={model.y(v)}
            className="stroke-border"
            strokeWidth={0.5}
          />
          <text
            x={PAD.left - 6}
            y={model.y(v)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {labelY(v)}
          </text>
        </g>
      ))}

      {/* Lignes de seuils */}
      {seuilMax !== null && (
        <SeuilLine
          y={model.y(seuilMax)}
          label={`max ${labelY(seuilMax)}${uniteSymbole ? ` ${uniteSymbole}` : ''}`}
        />
      )}
      {seuilMin !== null && (
        <SeuilLine
          y={model.y(seuilMin)}
          label={`min ${labelY(seuilMin)}${uniteSymbole ? ` ${uniteSymbole}` : ''}`}
        />
      )}

      {/* Aire + courbe */}
      <polygon points={model.aire} fill={`url(#${gradId})`} />
      <polyline
        points={model.ligne}
        fill="none"
        className="stroke-primary"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Points (cliquables → OT source) */}
      {model.coords.map((c) => (
        <g key={c.point.executionId}>
          <circle
            cx={c.cx}
            cy={c.cy}
            r={4}
            className={
              c.point.estConforme === false
                ? 'fill-destructive stroke-background'
                : 'fill-primary stroke-background'
            }
            strokeWidth={1.5}
          />
          {onPointClick && (
            <circle
              cx={c.cx}
              cy={c.cy}
              r={12}
              fill="transparent"
              className="cursor-pointer"
              onClick={() => onPointClick(c.point)}
            >
              <title>
                {formatDateCourte(c.point.date)} : {c.point.valeur}
                {uniteSymbole ? ` ${uniteSymbole}` : ''}
              </title>
            </circle>
          )}
        </g>
      ))}

      {/* Étiquettes X (première et dernière dates) */}
      <text
        x={PAD.left}
        y={H - 8}
        textAnchor="start"
        className="fill-muted-foreground text-[10px]"
      >
        {formatDateCourte(model.premier.date)}
      </text>
      {points.length > 1 && (
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          className="fill-muted-foreground text-[10px]"
        >
          {formatDateCourte(model.dernier.date)}
        </text>
      )}
    </svg>
  )
}

function SeuilLine({ y, label }: { y: number; label: string }) {
  return (
    <g>
      <line
        x1={PAD.left}
        x2={W - PAD.right}
        y1={y}
        y2={y}
        className="stroke-destructive"
        strokeWidth={1}
        strokeDasharray="4 3"
        opacity={0.7}
      />
      <text
        x={W - PAD.right - 2}
        y={y - 3}
        textAnchor="end"
        className="fill-destructive text-[10px]"
      >
        {label}
      </text>
    </g>
  )
}
