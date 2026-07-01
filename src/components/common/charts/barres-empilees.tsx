import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  onKeyActivate,
  toneToken,
  type ChartSegment,
} from '@/components/common/charts/chart-legend'

export interface BarreColonne {
  cle: string
  label: string
  /** Colonne « en cours » (période courante) : étiquette en gras + accent. */
  enCours?: boolean
  /** Empilement d'états, du bas vers le haut ; valeur 0 non dessinée. */
  segments: ChartSegment[]
}

interface BarresEmpileesProps {
  colonnes: BarreColonne[]
  onColonneClick?: (cle: string) => void
  /** Année (ou autre) affichée en filigrane derrière les barres. */
  filigrane?: string
  className?: string
}

// Géométrie en PIXELS RÉELS (le SVG épouse la taille mesurée du conteneur → les
// barres remplissent toute la hauteur disponible, sans écrasement quand le nombre de
// colonnes augmente).
const PAD_TOP = 8 // marge au-dessus de la plus haute barre
const LABEL_H = 22 // bande des étiquettes (n° de semaine) sous la ligne de base
const BAR_RATIO = 0.8 // largeur de barre / largeur d'emplacement (le reste = écart)
const BAR_MAX_RATIO = 0.98 // la plus haute barre occupe ~toute la zone de tracé

/**
 * Barres empilées SVG maison : une barre par colonne, empilée par état, de hauteur
 * proportionnelle au total (échelle commune sur toutes les colonnes). Le composant
 * MESURE son conteneur (largeur + hauteur) et dessine en pixels réels → il occupe
 * toute la place offerte (le conteneur doit donc avoir une hauteur définie, ex.
 * `flex-1`). La colonne `enCours` reçoit une étiquette en gras + accent. Survol →
 * atténuation des autres + infobulle récap ; clic → `onColonneClick`. La navigation
 * temporelle n'est PAS gérée ici : le parent fournit les colonnes.
 */
export function BarresEmpilees({
  colonnes,
  onColonneClick,
  filigrane,
  className,
}: BarresEmpileesProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [taille, setTaille] = useState({ w: 0, h: 0 })

  // Mesure de la boîte (relevé initial synchrone + ResizeObserver via rAF, sans boucle).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const relever = () =>
      setTaille((prev) =>
        prev.w === el.clientWidth && prev.h === el.clientHeight
          ? prev
          : { w: el.clientWidth, h: el.clientHeight },
      )
    relever()
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(relever)
    })
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const { w, h } = taille
  const n = Math.max(colonnes.length, 1)

  const totaux = colonnes.map((c) =>
    c.segments.reduce((acc, s) => acc + Math.max(s.value, 0), 0),
  )
  const maxTotal = Math.max(0, ...totaux)

  const colW = w / n
  const barW = colW * BAR_RATIO
  const baseline = h - LABEL_H // ligne de base des barres
  const plotH = Math.max(baseline - PAD_TOP, 0) // hauteur utile de tracé
  const barMaxH = plotH * BAR_MAX_RATIO
  // Année en filigrane : discrète, placée en HAUT (baseline juste sous la marge haute).
  const filigraneFont = Math.min(plotH * 0.5, w * 0.28)

  return (
    <div ref={ref} className={cn('relative h-full w-full', className)}>
      {w > 0 && h > 0 && (
        <svg
          viewBox={`0 0 ${String(w)} ${String(h)}`}
          width={w}
          height={h}
          role="img"
          aria-label="Barres empilées par période"
          className="block"
        >
          {/* Fond de la colonne « en cours » (semaine courante) : MÊME token que le
              surlignage du planning (`--col-active`), dessiné derrière les barres. */}
          {colonnes.map((col, i) =>
            col.enCours ? (
              <rect
                key={`col-active-${col.cle}`}
                x={i * colW}
                y={0}
                width={colW}
                height={h}
                fill="var(--col-active)"
              />
            ) : null,
          )}

          {filigrane && (
            <text
              x={w / 2}
              y={PAD_TOP + filigraneFont * 0.82}
              textAnchor="middle"
              style={{
                fill: 'var(--muted-foreground)',
                opacity: 0.08,
                fontSize: filigraneFont,
                fontWeight: 700,
              }}
            >
              {filigrane}
            </text>
          )}

          {colonnes.map((col, i) => {
            const total = col.segments.reduce(
              (acc, s) => acc + Math.max(s.value, 0),
              0,
            )
            const cx = i * colW + colW / 2
            const barX = cx - barW / 2
            const barH = maxTotal > 0 ? (total / maxTotal) * barMaxH : 0
            const interactif = Boolean(onColonneClick)

            const actifs = col.segments.filter((s) => s.value > 0)
            const recap = actifs
              .map((s) => `${s.label} : ${String(s.value)}`)
              .join(' · ')
            const infobulle = `${col.label} — total ${String(total)}${
              recap ? ` (${recap})` : ''
            }`

            // Empilement du bas vers le haut.
            let y = baseline
            const rects = actifs.map((seg) => {
              const hSeg = total > 0 ? (seg.value / total) * barH : 0
              y -= hSeg
              return { seg, y, h: hSeg }
            })
            // Coins arrondis UNIQUEMENT sur la silhouette de la barre entière (haut +
            // bas) : on découpe l'empilement par un rectangle arrondi. Les segments
            // internes restent jointifs → pas de « liseré » par couleur.
            const rayon = Math.min(barW * 0.18, barH / 2, 7)
            const clipId = `barre-clip-${col.cle}`

            return (
              <g key={col.cle} className="group">
                {barH > 0 && (
                  <>
                    <clipPath id={clipId}>
                      <rect
                        x={barX}
                        y={baseline - barH}
                        width={barW}
                        height={barH}
                        rx={rayon}
                        ry={rayon}
                      />
                    </clipPath>
                    <g
                      clipPath={`url(#${clipId})`}
                      className="transition-[filter] group-hover:brightness-110"
                    >
                      {rects.map(({ seg, y: ry, h: rh }) => (
                        <rect
                          key={seg.key}
                          x={barX}
                          y={ry}
                          width={barW}
                          height={Math.max(rh, 0)}
                          fill={toneToken(seg.tone)}
                        >
                          <title>{`${col.label} — ${seg.label} : ${String(seg.value)}`}</title>
                        </rect>
                      ))}
                    </g>
                  </>
                )}

                <text
                  x={cx}
                  y={baseline + LABEL_H - 7}
                  textAnchor="middle"
                  style={{
                    fill: 'var(--foreground)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {col.label}
                </text>

                {/* Zone de capture : survol + infobulle récap + clic colonne. */}
                <rect
                  x={i * colW}
                  y={0}
                  width={colW}
                  height={h}
                  fill="transparent"
                  className={cn('outline-none', interactif && 'cursor-pointer')}
                  role={interactif ? 'button' : 'img'}
                  aria-label={infobulle}
                  tabIndex={interactif ? 0 : undefined}
                  onClick={
                    onColonneClick ? () => onColonneClick(col.cle) : undefined
                  }
                  onKeyDown={onKeyActivate(
                    onColonneClick ? () => onColonneClick(col.cle) : undefined,
                  )}
                >
                  <title>{infobulle}</title>
                </rect>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
