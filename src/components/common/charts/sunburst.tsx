import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { onKeyActivate } from '@/components/common/charts/chart-legend'

/**
 * Nœud d'un sunburst à 3 niveaux (domaine → famille → gamme). L'angle d'un nœud
 * est proportionnel à la somme des `poids` de ses feuilles. `couleur` est le
 * remplissage DÉJÀ RÉSOLU (teinte du domaine éclaircie selon la profondeur, et
 * modulée par la santé pour les feuilles) ; `statutLabel` complète l'infobulle,
 * `hachures` superpose un motif rayé (gammes réglementaires), `blink` fait clignoter
 * doucement (remplacé par un liséré statique sous `prefers-reduced-motion`).
 */
export interface SunburstNode {
  key: string
  label: string
  couleur: string
  poids: number
  statutLabel?: string
  hachures?: boolean
  blink?: boolean
  onClick?: () => void
  enfants?: SunburstNode[]
}

interface SunburstProps {
  noeuds: SunburstNode[]
  centre?: ReactNode
  onCentreClick?: () => void
  className?: string
}

// Rayon du trou central (réservé au `centre`), en unités de viewBox. Trou compact →
// anneaux généreux (proportions calquées sur la référence PO).
const RAYON_TROU = 15
// Petit espace RADIAL entre anneaux concentriques (le fond de la carte transparaît
// dans l'interstice → anneaux bien séparés).
const GAP_ANNEAU = 1.2
// Rayons [intérieur, extérieur] par profondeur, en unités de viewBox. Anneau extérieur
// (gammes) ÉPAIS et détaillé, jusqu'au bord du cadre ; interstice entre chaque anneau.
const RAYONS: Record<number, [number, number]> = {
  1: [RAYON_TROU, 28],
  2: [28 + GAP_ANNEAU, 38],
  3: [38 + GAP_ANNEAU, 49],
}
// Anneaux à luminosité HOMOGÈNE : plus d'assombrissement par profondeur — les anneaux
// se distinguent par les interstices (`GAP_ANNEAU`), la santé de la feuille module seule
// l'opacité (`node.opacite`).
const GAP_DEG = 0.7

/** Formate une coordonnée SVG (borne la précision). */
const fmt = (v: number) => v.toFixed(2)

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

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

/** Somme des poids des feuilles d'un nœud (un nœud sans enfant est sa feuille). */
function poidsFeuilles(node: SunburstNode): number {
  if (node.enfants && node.enfants.length > 0) {
    return node.enfants.reduce((acc, n) => acc + poidsFeuilles(n), 0)
  }
  return Math.max(node.poids, 0)
}

interface Arc {
  node: SunburstNode
  depth: number
  a0: number
  a1: number
}

/** Répartit récursivement l'angle disponible entre les nœuds, par poids. */
function disposer(
  nodes: SunburstNode[],
  angleDebut: number,
  spanTotal: number,
  poidsTotal: number,
  depth: number,
  acc: Arc[],
) {
  let curseur = angleDebut
  for (const node of nodes) {
    const poids = poidsFeuilles(node)
    const span = poidsTotal > 0 ? (poids / poidsTotal) * spanTotal : 0
    const a0 = curseur
    const a1 = curseur + span
    acc.push({ node, depth, a0, a1 })
    if (node.enfants && node.enfants.length > 0) {
      disposer(node.enfants, a0, span, poids, depth + 1, acc)
    }
    curseur = a1
  }
}

/** Détecte `prefers-reduced-motion: reduce` et suit ses changements. */
function useReducedMotion() {
  const [reduit, setReduit] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const maj = () => setReduit(mq.matches)
    maj()
    mq.addEventListener('change', maj)
    return () => mq.removeEventListener('change', maj)
  }, [])
  return reduit
}

/**
 * Sunburst SVG maison à 3 anneaux concentriques. Chaque nœud porte sa `couleur`
 * déjà résolue (teinte du domaine héritée et ÉCLAIRCIE vers l'extérieur, modulée par
 * la santé des feuilles), `hachures` via `<pattern>` superposé, `blink` via animation
 * d'opacité douce (liséré statique sous reduced-motion). Survol → surbrillance +
 * infobulle, clic feuille/branche → `onClick`, clic centre → `onCentreClick`.
 */
export function Sunburst({
  noeuds,
  centre,
  onCentreClick,
  className,
}: SunburstProps) {
  const reduit = useReducedMotion()

  const cx = 50
  const cy = 50
  const total = noeuds.reduce((acc, n) => acc + poidsFeuilles(n), 0)

  const arcs: Arc[] = []
  if (total > 0) disposer(noeuds, 0, 360, total, 1, arcs)

  return (
    <div className={cn('@container relative', className)}>
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Répartition en anneaux (sunburst)"
        className="block w-full"
      >
        {/* Animation de clignotement ; neutralisée si l'utilisateur réduit les
            mouvements (le liséré statique prend alors le relais). */}
        <style>
          {`@media (prefers-reduced-motion: no-preference){` +
            `@keyframes dedaleSunburstBlink{0%,100%{opacity:1}50%{opacity:.45}}` +
            `.dedale-sunburst-blink{animation:dedaleSunburstBlink 1.6s ease-in-out infinite}}`}
        </style>

        {arcs.map(({ node, depth, a0, a1 }) => {
          const rayons = RAYONS[depth]
          if (!rayons) return null
          const [rInt, rExt] = rayons

          // Petit espace entre voisins (sans dégénérer les tout petits secteurs).
          let da0 = a0 + GAP_DEG / 2
          let da1 = a1 - GAP_DEG / 2
          if (da1 <= da0) {
            da0 = a0
            da1 = a1
          }
          // Nœud unique couvrant tout le cercle : évite le secteur dégénéré.
          if (da1 - da0 >= 359.9) {
            da0 = 0.0001
            da1 = 359.999
          }
          if (da1 <= da0) return null

          const id = `${String(depth)}:${node.key}`
          const interactif = Boolean(node.onClick)
          const infobulle = node.statutLabel
            ? `${node.label} · ${node.statutLabel}`
            : node.label
          const d = secteurAnnulaire(cx, cy, rExt, rInt, da0, da1)
          const clignote = Boolean(node.blink)

          return (
            <g key={id}>
              <path
                d={d}
                style={{ fill: node.couleur }}
                className={cn(
                  'transition-[filter] outline-none focus-visible:brightness-110',
                  interactif && 'cursor-pointer hover:brightness-110',
                  clignote && !reduit && 'dedale-sunburst-blink',
                )}
                role={interactif ? 'button' : 'img'}
                aria-label={infobulle}
                tabIndex={interactif ? 0 : undefined}
                onClick={node.onClick}
                onKeyDown={onKeyActivate(node.onClick)}
              >
                <title>{infobulle}</title>
              </path>

              {/* Gammes réglementaires : trame rayée superposée, orientée PAR RAPPORT au
                  secteur (le motif tourne de l'angle médian) → même rendu quelle que soit
                  la position de la gamme autour du cercle. */}
              {node.hachures && (
                <>
                  <pattern
                    id={`dedale-hachures-${node.key.replace(/:/g, '-')}`}
                    patternUnits="userSpaceOnUse"
                    width="1.5"
                    height="1.5"
                    patternTransform={`rotate(${String(Math.round((da0 + da1) / 2 + 45))})`}
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1.5"
                      stroke="var(--foreground)"
                      strokeWidth="1.1"
                      opacity="0.35"
                    />
                  </pattern>
                  <path
                    d={d}
                    fill={`url(#dedale-hachures-${node.key.replace(/:/g, '-')})`}
                    pointerEvents="none"
                  />
                </>
              )}

              {/* Liséré statique de remplacement du clignotement (reduced-motion). */}
              {clignote && reduit && (
                <path
                  d={d}
                  fill="none"
                  style={{ stroke: node.couleur }}
                  strokeWidth="1.4"
                  pointerEvents="none"
                />
              )}
            </g>
          )
        })}

        {/* Trou central. */}
        <circle cx={cx} cy={cy} r={RAYON_TROU} fill="var(--card)" />
      </svg>

      {/* Contenu central, cliquable si `onCentreClick` fourni. */}
      {centre != null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center">
          {onCentreClick ? (
            <button
              type="button"
              onClick={onCentreClick}
              className="focus-visible:ring-ring pointer-events-auto flex items-center justify-center rounded-full outline-none focus-visible:ring-2"
            >
              {centre}
            </button>
          ) : (
            centre
          )}
        </div>
      )}
    </div>
  )
}
