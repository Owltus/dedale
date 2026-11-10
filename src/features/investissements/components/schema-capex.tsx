import type { CSSProperties } from 'react'
import {
  CalendarClock,
  Check,
  CircleCheck,
  CircleX,
  Inbox,
  PackageCheck,
  type LucideIcon,
} from 'lucide-react'
import { toneToken } from '@/components/common/charts/chart-tokens'
import { cn } from '@/lib/utils'
import {
  statutCapexTone,
  type ActionCapex,
  type CaseCapex,
  type EtatFlecheCapex,
  type SchemaCapex as Schema,
} from '@/features/investissements/etat'

// Organigramme façon Mermaid (138, demande PO) — ordinateur, toute la largeur :
//
//                 ╭──▶ Refusé
//   Demandé ──────┼──▶ Validé ─────▶ Réalisé
//                 ╰──▶ Reporter à N+1
//
// Téléphone : la même chose de haut en bas. Les flèches sont des COURBES SVG
// étirées à leur cellule (`preserveAspectRatio="none"`) ; `vector-effect:
// non-scaling-stroke` garde l'épaisseur et les pointillés réguliers malgré
// l'étirement. Les pointes, elles, sont posées à part (taille fixe) pour ne pas
// se déformer. Rangées / colonnes ÉGALES et sans gouttière : leurs centres
// tombent à 1/6, 1/2, 5/6 — là où arrivent les courbes.

type Orientation = 'h' | 'v'

const POSITIONS = ['16.667%', '50%', '83.333%'] as const

/** Trait : chemin pris (plein, coloré) ou possible (fin, pointillé, discret). */
function styleTrait(etat: EtatFlecheCapex): {
  className: string
  epais: number
  pointille?: string
} {
  if (etat === 'ok') return { className: 'text-success', epais: 2.5 }
  if (etat === 'refus') return { className: 'text-destructive', epais: 2.5 }
  return {
    className: 'text-muted-foreground/45',
    epais: 1.5,
    pointille: '5 5',
  }
}

/** Pointe de flèche à taille fixe, orientée vers la droite ou vers le bas. */
function Pointe({
  orientation,
  position,
  etat,
}: {
  orientation: Orientation
  position: string
  etat: EtatFlecheCapex
}) {
  const h = orientation === 'h'
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={cn(
        'absolute size-2.5 fill-current',
        h ? 'right-0 -translate-y-1/2' : 'bottom-0 -translate-x-1/2',
        styleTrait(etat).className,
      )}
      style={h ? { top: position } : { left: position }}
    >
      <path d={h ? 'M0 0 L10 5 L0 10 z' : 'M0 0 L10 0 L5 10 z'} />
    </svg>
  )
}

/**
 * Faisceau de flèches courbes d'un point de départ (milieu du bord d'entrée)
 * vers une ou trois arrivées. Coordonnées : 0-100 dans le sens du flux,
 * 0-300 en travers (centres des cibles à 50, 150, 250).
 */
function Liens({
  orientation,
  liens,
}: {
  orientation: Orientation
  liens: { vers: 0 | 1 | 2; etat: EtatFlecheCapex }[]
}) {
  const h = orientation === 'h'
  // Les traits non empruntés d'abord : le chemin pris passe par-dessus.
  const ordonnes = [...liens].sort(
    (a, b) => Number(a.etat !== 'libre') - Number(b.etat !== 'libre'),
  )
  return (
    <>
      <svg
        aria-hidden
        viewBox={h ? '0 0 100 300' : '0 0 300 100'}
        preserveAspectRatio="none"
        className={cn(
          // Taille EXPLICITE : un <svg> en position absolue ne s'étire pas
          // avec left/right comme une div. Le bout est réservé aux pointes.
          'absolute top-0 left-0 overflow-visible',
          h
            ? 'h-full w-[calc(100%-0.625rem)]'
            : 'h-[calc(100%-0.625rem)] w-full',
        )}
      >
        {ordonnes.map(({ vers, etat }) => {
          const y = 50 + vers * 100
          const d = h
            ? `M0 150 C55 150 45 ${String(y)} 100 ${String(y)}`
            : `M150 0 C150 55 ${String(y)} 45 ${String(y)} 100`
          const t = styleTrait(etat)
          return (
            <path
              key={vers}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={t.epais}
              strokeDasharray={t.pointille}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={t.className}
            />
          )
        })}
      </svg>
      {liens.map(({ vers, etat }) => (
        <Pointe
          key={vers}
          orientation={orientation}
          position={POSITIONS[vers]}
          etat={etat}
        />
      ))}
    </>
  )
}

const ICONES = {
  demande: Inbox,
  valide: CircleCheck,
  realise: PackageCheck,
  refuse: CircleX,
  reporte: CalendarClock,
} satisfies Record<string, LucideIcon>

type CleCase = keyof typeof ICONES

/** Couleur de la case où se trouve le dossier : celle de son statut. */
function couleurActuelle(statutId: number): string {
  const tone = statutCapexTone(statutId)
  return tone === 'neutral' ? 'var(--primary)' : toneToken(tone)
}

function styleActuel(statutId: number): CSSProperties {
  const c = couleurActuelle(statutId)
  return {
    borderColor: c,
    backgroundColor: `color-mix(in oklch, ${c} 13%, var(--card))`,
    boxShadow: `0 0 0 4px color-mix(in oklch, ${c} 16%, transparent), 0 8px 24px -8px color-mix(in oklch, ${c} 55%, transparent)`,
  }
}

function Case({
  cle,
  c,
  onAction,
  disabled,
}: {
  cle: CleCase
  c: CaseCapex
  onAction?: (a: ActionCapex) => void
  disabled?: boolean
}) {
  const Icone = c.etat === 'fait' ? Check : ICONES[cle]
  const actuel = c.etat === 'actuel'
  const couleur = actuel && c.statutId ? couleurActuelle(c.statutId) : undefined
  const contenu = (
    <>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          c.etat === 'fait' && 'bg-success/15 text-success',
          c.etat === 'libre' && 'bg-muted text-muted-foreground',
        )}
        style={
          couleur
            ? {
                color: couleur,
                backgroundColor: `color-mix(in oklch, ${couleur} 18%, transparent)`,
              }
            : undefined
        }
      >
        <Icone aria-hidden className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col items-start text-left">
        <span className="leading-tight">{c.libelle}</span>
        {actuel && (
          <span
            className="text-xs font-normal"
            style={couleur ? { color: couleur } : undefined}
          >
            Le dossier est ici
          </span>
        )}
      </span>
    </>
  )
  const classes = cn(
    'flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-4 py-2.5 text-sm font-medium shadow-xs',
    c.etat === 'fait' && 'border-success/40',
    c.etat === 'libre' && 'text-muted-foreground',
    actuel && 'border-2 font-semibold text-foreground',
    cle === 'reporte' && 'border-dashed',
  )
  if (c.action && onAction) {
    const action = c.action
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction(action)}
        title={cle === 'reporte' ? c.libelle : `Passer à « ${c.libelle} »`}
        className={cn(
          classes,
          'cursor-pointer transition duration-150 hover:-translate-y-0.5 hover:text-foreground hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          cle === 'refuse'
            ? 'hover:border-destructive/60'
            : 'hover:border-foreground/30',
        )}
      >
        {contenu}
      </button>
    )
  }
  return (
    <div
      className={classes}
      style={actuel && c.statutId ? styleActuel(c.statutId) : undefined}
      aria-current={actuel ? 'step' : undefined}
    >
      {contenu}
    </div>
  )
}

interface PropsSchema {
  schema: Schema
  onAction?: (a: ActionCapex) => void
  disabled?: boolean
}

/** Liens de la fourche qui part de « Demandé ». */
function liensFourche(f: Schema['fleches']) {
  return [
    { vers: 0 as const, etat: f.versRefuse },
    { vers: 1 as const, etat: f.versValide },
    { vers: 2 as const, etat: f.versReporte },
  ]
}

/** Ordinateur : de gauche à droite, sur toute la largeur. */
function SchemaHorizontal({ schema, onAction, disabled }: PropsSchema) {
  const props = { onAction, disabled }
  const cellule = 'flex items-center py-2'
  return (
    <div className="hidden w-full grid-cols-[minmax(0,1fr)_minmax(4rem,0.8fr)_minmax(0,1fr)_minmax(3rem,0.5fr)_minmax(0,1fr)] grid-rows-3 md:grid">
      <div className={cn(cellule, 'col-start-1 row-start-2')}>
        <Case cle="demande" c={schema.demande} {...props} />
      </div>
      <div className="relative col-start-2 row-span-3 row-start-1">
        <Liens orientation="h" liens={liensFourche(schema.fleches)} />
      </div>
      <div className={cn(cellule, 'col-start-3 row-start-1')}>
        <Case cle="refuse" c={schema.refuse} {...props} />
      </div>
      <div className={cn(cellule, 'col-start-3 row-start-2')}>
        <Case cle="valide" c={schema.valide} {...props} />
      </div>
      <div className={cn(cellule, 'col-start-3 row-start-3')}>
        <Case cle="reporte" c={schema.reporte} {...props} />
      </div>
      {/* Validé → Réalisé : sur la rangée du milieu, flèche droite. */}
      <div className="relative col-start-4 row-span-3 row-start-1">
        <Liens
          orientation="h"
          liens={[{ vers: 1, etat: schema.fleches.versRealise }]}
        />
      </div>
      <div className={cn(cellule, 'col-start-5 row-start-2')}>
        <Case cle="realise" c={schema.realise} {...props} />
      </div>
    </div>
  )
}

/** Téléphone : de haut en bas. */
function SchemaVertical({ schema, onAction, disabled }: PropsSchema) {
  const props = { onAction, disabled }
  const trois = 'grid grid-cols-3'
  const cellule = 'flex px-1'
  return (
    <div className="w-full md:hidden">
      <div className={trois}>
        <div className={cn(cellule, 'col-start-2')}>
          <Case cle="demande" c={schema.demande} {...props} />
        </div>
      </div>
      <div className="relative h-14">
        <Liens orientation="v" liens={liensFourche(schema.fleches)} />
      </div>
      <div className={trois}>
        <div className={cellule}>
          <Case cle="refuse" c={schema.refuse} {...props} />
        </div>
        <div className={cellule}>
          <Case cle="valide" c={schema.valide} {...props} />
        </div>
        <div className={cellule}>
          <Case cle="reporte" c={schema.reporte} {...props} />
        </div>
      </div>
      <div className="relative h-10">
        <Liens
          orientation="v"
          liens={[{ vers: 1, etat: schema.fleches.versRealise }]}
        />
      </div>
      <div className={trois}>
        <div className={cn(cellule, 'col-start-2')}>
          <Case cle="realise" c={schema.realise} {...props} />
        </div>
      </div>
    </div>
  )
}

/**
 * Schéma du parcours d'un investissement, sur un fond « toile » pointillé.
 * La case colorée = où en est le dossier ; un clic sur une autre case y fait
 * passer le dossier (rôles qui peuvent modifier, sinon lecture seule).
 */
export function SchemaCapex(props: PropsSchema) {
  return (
    <div
      role="group"
      aria-label="Parcours du dossier"
      className="rounded-lg px-3 py-6 sm:px-6"
      style={{
        backgroundImage:
          'radial-gradient(color-mix(in oklch, var(--muted-foreground) 22%, transparent) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    >
      <SchemaHorizontal {...props} />
      <SchemaVertical {...props} />
    </div>
  )
}
