import type { CSSProperties, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { toneToken } from '@/components/common/charts/chart-tokens'
import { cn } from '@/lib/utils'
import {
  statutCapexTone,
  type ActionCapex,
  type CaseCapex,
  type EtatFlecheCapex,
  type SchemaCapex as Schema,
} from '@/features/investissements/etat'

// Organigramme VERTICAL façon Mermaid (138, demande PO) :
//
//                  Demandé
//         ┌───────────┼───────────┐
//         ▼           ▼           ▼
//      Refusé      Validé     Reporter à N+1
//                     │
//                     ▼
//                  Réalisé
//
// Tout repose sur UNE grille de 3 colonnes égales SANS gouttière : les centres
// des colonnes tombent exactement à 1/6, 1/2 et 5/6 de la largeur, ce qui
// permet de poser les traits des flèches en pourcentages, pile au centre des
// cases. L'écart entre les cases vient du padding des cellules.

const COLONNES = 'grid grid-cols-3'
const CELLULE = 'flex px-1.5 sm:px-3'

/** Couleur d'un trait selon le chemin pris par le dossier. */
function couleur(f: EtatFlecheCapex): string {
  if (f === 'ok') return 'text-success'
  if (f === 'refus') return 'text-destructive'
  return 'text-muted-foreground/40'
}

/** Trait vertical centré sur `gauche`, terminé par une pointe vers le bas. */
function Tige({
  gauche,
  depuis,
  etat,
}: {
  gauche: string
  depuis: string
  etat: EtatFlecheCapex
}) {
  return (
    <span
      aria-hidden
      className={cn('absolute bottom-0 -translate-x-1/2', couleur(etat))}
      style={{ left: gauche, top: depuis }}
    >
      <span className="absolute inset-x-0 top-0 bottom-1.5 mx-auto w-0.5 bg-current" />
      <svg
        viewBox="0 0 10 7"
        className="absolute bottom-0 left-1/2 h-1.5 w-2.5 -translate-x-1/2 fill-current"
      >
        <path d="M0 0 H10 L5 7 z" />
      </svg>
      {/* Largeur de la pointe : réserve la place pour le centrage. */}
      <span className="block h-full w-2.5" />
    </span>
  )
}

/** Segment horizontal entre deux abscisses, à mi-hauteur de la fourche. */
function Barre({
  de,
  a,
  etat,
}: {
  de: string
  a: string
  etat: EtatFlecheCapex
}) {
  return (
    <span
      aria-hidden
      className={cn('absolute top-1/2 h-0.5 -translate-y-1/2', couleur(etat))}
      style={{ left: de, width: `calc(${a} - ${de} + 1px)` }}
    >
      <span className="block size-full bg-current" />
    </span>
  )
}

/** Fourche sous « Demandé » : vers Refusé, Validé et le report. */
function Fourche({ fleches }: { fleches: Schema['fleches'] }) {
  const tronc =
    fleches.versValide !== 'libre'
      ? fleches.versValide
      : fleches.versRefuse !== 'libre'
        ? fleches.versRefuse
        : 'libre'
  return (
    <div className="relative h-12">
      {/* Tronc : de Demandé jusqu'à la barre. */}
      <span
        aria-hidden
        className={cn(
          'absolute top-0 left-1/2 h-1/2 w-0.5 -translate-x-1/2',
          couleur(tronc),
        )}
      >
        <span className="block size-full bg-current" />
      </span>
      <Barre de="16.667%" a="50%" etat={fleches.versRefuse} />
      <Barre de="50%" a="83.333%" etat={fleches.versReporte} />
      <Tige gauche="16.667%" depuis="50%" etat={fleches.versRefuse} />
      <Tige gauche="50%" depuis="50%" etat={fleches.versValide} />
      <Tige gauche="83.333%" depuis="50%" etat={fleches.versReporte} />
    </div>
  )
}

/** Style de la case où se trouve le dossier : la couleur de son statut. */
function styleActuel(statutId: number): CSSProperties {
  const tone = statutCapexTone(statutId)
  const c = tone === 'neutral' ? 'var(--primary)' : toneToken(tone)
  return {
    borderColor: c,
    color: c,
    backgroundColor: `color-mix(in oklch, ${c} 14%, var(--card))`,
    boxShadow: `0 0 0 4px color-mix(in oklch, ${c} 18%, transparent)`,
  }
}

function Case({
  c,
  pointille,
  danger,
  onAction,
  disabled,
}: {
  c: CaseCapex
  /** Case d'action et non de statut (le report). */
  pointille?: boolean
  /** Survol rouge (refus). */
  danger?: boolean
  onAction?: (a: ActionCapex) => void
  disabled?: boolean
}) {
  const contenu: ReactNode = (
    <>
      {c.etat === 'fait' && (
        <Check aria-hidden className="size-4 shrink-0 text-success" />
      )}
      <span>{c.libelle}</span>
    </>
  )
  const classes = cn(
    'flex min-h-12 w-full items-center justify-center gap-1.5 rounded-lg border-2 bg-card px-2 py-2 text-center text-sm leading-tight font-medium',
    c.etat === 'fait' && 'border-success/50',
    c.etat === 'libre' && 'text-muted-foreground',
    pointille && 'border-dashed',
  )
  const style =
    c.etat === 'actuel' && c.statutId ? styleActuel(c.statutId) : undefined
  if (c.action && onAction) {
    const action = c.action
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction(action)}
        title={pointille ? c.libelle : `Passer à « ${c.libelle} »`}
        className={cn(
          classes,
          'cursor-pointer transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          danger ? 'hover:border-destructive' : 'hover:border-foreground/40',
        )}
      >
        {contenu}
      </button>
    )
  }
  return (
    <div
      className={cn(classes, c.etat === 'actuel' && 'font-semibold')}
      style={style}
      aria-current={c.etat === 'actuel' ? 'step' : undefined}
    >
      {contenu}
      {c.etat === 'actuel' && (
        <span className="sr-only"> — le dossier est ici</span>
      )}
    </div>
  )
}

interface PropsSchema {
  schema: Schema
  onAction?: (a: ActionCapex) => void
  disabled?: boolean
}

/** Téléphone : de haut en bas (Demandé, la fourche, puis Réalisé). */
function SchemaVertical({ schema, onAction, disabled }: PropsSchema) {
  const props = { onAction, disabled }
  return (
    <div className="mx-auto w-full max-w-xl md:hidden">
      <div className={COLONNES}>
        <div className="col-start-2">
          <div className={CELLULE}>
            <Case c={schema.demande} {...props} />
          </div>
        </div>
      </div>
      <Fourche fleches={schema.fleches} />
      <div className={COLONNES}>
        <div className={CELLULE}>
          <Case c={schema.refuse} danger {...props} />
        </div>
        <div className={CELLULE}>
          <Case c={schema.valide} {...props} />
        </div>
        <div className={CELLULE}>
          <Case c={schema.reporte} pointille {...props} />
        </div>
      </div>
      <div className="relative h-10">
        <Tige gauche="50%" depuis="0" etat={schema.fleches.versRealise} />
      </div>
      <div className={COLONNES}>
        <div className="col-start-2">
          <div className={CELLULE}>
            <Case c={schema.realise} {...props} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Trait horizontal à la hauteur `haut`, de `de` à `a` ; pointe à droite si `pointe`. */
function TraitH({
  haut,
  de,
  a,
  etat,
  pointe,
}: {
  haut: string
  de: string
  a: string
  etat: EtatFlecheCapex
  pointe?: boolean
}) {
  return (
    <span
      aria-hidden
      className={cn('absolute h-2.5 -translate-y-1/2', couleur(etat))}
      style={{ top: haut, left: de, right: `calc(100% - ${a})` }}
    >
      <span
        className={cn(
          'absolute inset-y-0 left-0 my-auto h-0.5 bg-current',
          pointe ? 'right-1.5' : 'right-0',
        )}
      />
      {pointe && (
        <svg
          viewBox="0 0 7 10"
          className="absolute inset-y-0 right-0 my-auto h-2.5 w-1.5 fill-current"
        >
          <path d="M0 0 L7 5 L0 10 z" />
        </svg>
      )}
    </span>
  )
}

/** Trait vertical à l'abscisse `gauche`, de `de` à `a` (sans pointe). */
function TraitV({
  gauche,
  de,
  a,
  etat,
}: {
  gauche: string
  de: string
  a: string
  etat: EtatFlecheCapex
}) {
  return (
    <span
      aria-hidden
      className={cn('absolute w-0.5 -translate-x-1/2', couleur(etat))}
      style={{ left: gauche, top: de, height: `calc(${a} - ${de} + 1px)` }}
    >
      <span className="block size-full bg-current" />
    </span>
  )
}

/**
 * Ordinateur : de gauche à droite, façon Mermaid « LR ».
 *
 *               ┌──▶ Refusé
 *   Demandé ────┼──▶ Validé ────▶ Réalisé
 *               └──▶ Reporter à N+1
 *
 * Trois RANGÉES égales sans gouttière : leurs centres tombent à 1/6, 1/2 et
 * 5/6 de la hauteur, où se posent les branches de la fourche.
 */
function SchemaHorizontal({ schema, onAction, disabled }: PropsSchema) {
  const props = { onAction, disabled }
  const f = schema.fleches
  const tronc =
    f.versValide !== 'libre'
      ? f.versValide
      : f.versRefuse !== 'libre'
        ? f.versRefuse
        : 'libre'
  const ligne = 'flex items-center py-1.5'
  return (
    <div className="mx-auto hidden w-full max-w-4xl grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)_3rem_minmax(0,1fr)] grid-rows-3 md:grid">
      <div className={cn(ligne, 'col-start-1 row-start-2')}>
        <Case c={schema.demande} {...props} />
      </div>
      {/* Fourche : tronc, barre verticale, trois branches fléchées. */}
      <div className="relative col-start-2 row-span-3 row-start-1">
        <TraitH haut="50%" de="0%" a="50%" etat={tronc} />
        <TraitV gauche="50%" de="16.667%" a="50%" etat={f.versRefuse} />
        <TraitV gauche="50%" de="50%" a="83.333%" etat={f.versReporte} />
        <TraitH haut="16.667%" de="50%" a="100%" etat={f.versRefuse} pointe />
        <TraitH haut="50%" de="50%" a="100%" etat={f.versValide} pointe />
        <TraitH haut="83.333%" de="50%" a="100%" etat={f.versReporte} pointe />
      </div>
      <div className={cn(ligne, 'col-start-3 row-start-1')}>
        <Case c={schema.refuse} danger {...props} />
      </div>
      <div className={cn(ligne, 'col-start-3 row-start-2')}>
        <Case c={schema.valide} {...props} />
      </div>
      <div className={cn(ligne, 'col-start-3 row-start-3')}>
        <Case c={schema.reporte} pointille {...props} />
      </div>
      <div className="relative col-start-4 row-start-2">
        <TraitH haut="50%" de="0%" a="100%" etat={f.versRealise} pointe />
      </div>
      <div className={cn(ligne, 'col-start-5 row-start-2')}>
        <Case c={schema.realise} {...props} />
      </div>
    </div>
  )
}

/**
 * Schéma du parcours d'un investissement : horizontal sur ordinateur,
 * vertical sur téléphone. La case colorée = où en est le dossier ; un clic
 * sur une autre case y fait passer le dossier (rôles qui peuvent modifier,
 * sinon lecture seule).
 */
export function SchemaCapex(props: PropsSchema) {
  return (
    <div role="group" aria-label="Parcours du dossier">
      <SchemaHorizontal {...props} />
      <SchemaVertical {...props} />
    </div>
  )
}
