import type { ComponentProps, CSSProperties, ReactNode } from 'react'
import {
  BadgeCheck,
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
import type { StatusTone } from '@/components/common/status-badge'
import type { RowAction } from '@/components/common/row-actions'
import { SurvolCase, useTexteTronque } from './survol-case'
import { ToileSchema } from './toile-schema'
import {
  type ActionCapex,
  type CaseCapex,
  type EtatFlecheCapex,
  type SchemaCapex as Schema,
} from '@/features/investissements/etat'

// Organigramme façon Mermaid (138, 147, demandes PO) — ordinateur :
//
//   Proposition ─▶ devis ─╮                  ╭─▶ Refusé
//                ─▶ devis  ├─(sélection)─────┼─▶ Prévalidé ─┬▶ Confirmé ──▶ Réalisé
//                                            (refus / report aux DEUX niveaux)
//                ─▶ devis ─╯                  ╰─▶ Reporter à N+1
//
// Téléphone : la même chose de haut en bas. Les flèches sont des COURBES SVG
// étirées à leur cellule (`preserveAspectRatio="none"`) ; `vector-effect:
// non-scaling-stroke` garde l'épaisseur et les pointillés réguliers malgré
// l'étirement. Les pointes, elles, sont posées à part (taille fixe) pour ne pas
// se déformer. Rangées / colonnes ÉGALES et sans gouttière : leurs centres
// tombent à 1/6, 1/2, 5/6 — là où arrivent les courbes.

type Orientation = 'h' | 'v'

const POSITIONS = ['16.667%', '50%', '83.333%'] as const

/**
 * Teinte d'une branche, même quand elle n'est pas empruntée : vert vers la
 * validation, rouge vers le refus, jaune vers le report (demande PO).
 */
type Teinte = 'ok' | 'refus' | 'report'

/**
 * Branche ÉCARTÉE (demande PO) : une fois le dossier validé ou refusé, les
 * autres branches s'effacent. Le survol les rend nettes : elles restent
 * cliquables pour changer d'avis.
 */
const ESTOMPE = 'opacity-30 saturate-50'

/**
 * État d'un trait : ceux du parcours, plus « choisi » — un devis retenu
 * avant que la décision soit prise (plein, couleur du stade du projet).
 */
type EtatTrait = EtatFlecheCapex | 'choisi'

/** Trait : chemin pris (plein, coloré) ou possible (fin, pointillé, pâle). */
function styleTrait(
  etat: EtatTrait,
  teinte: Teinte = 'ok',
): {
  className: string
  epais: number
  pointille?: string
} {
  if (etat === 'ok') return { className: 'text-(color:--parcours)', epais: 2.5 }
  if (etat === 'refus') return { className: 'text-destructive', epais: 2.5 }
  if (etat === 'choisi')
    return { className: 'text-(color:--parcours)', epais: 2 }
  return {
    className:
      teinte === 'refus'
        ? 'text-destructive/40'
        : teinte === 'report'
          ? 'text-warning/55'
          : 'text-muted-foreground/45',
    epais: 1.5,
    pointille: '5 5',
  }
}

/** Pointe de flèche à taille fixe, orientée vers la droite ou vers le bas. */
function Pointe({
  orientation,
  position,
  etat,
  teinte,
  estompe,
}: {
  orientation: Orientation
  position: string
  etat: EtatTrait
  teinte?: Teinte
  estompe?: boolean
}) {
  const h = orientation === 'h'
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={cn(
        'absolute size-2.5 fill-current',
        h ? 'right-0 -translate-y-1/2' : 'bottom-0 -translate-x-1/2',
        styleTrait(etat, teinte).className,
        estompe && ESTOMPE,
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
  liens: {
    vers: 0 | 1 | 2
    etat: EtatFlecheCapex
    teinte?: Teinte
    estompe?: boolean
  }[]
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
        {ordonnes.map(({ vers, etat, teinte, estompe }) => {
          const y = 50 + vers * 100
          const d = h
            ? `M0 150 C55 150 45 ${String(y)} 100 ${String(y)}`
            : `M150 0 C150 55 ${String(y)} 45 ${String(y)} 100`
          const t = styleTrait(etat, teinte)
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
              className={cn(t.className, estompe && ESTOMPE)}
            />
          )
        })}
      </svg>
      {liens.map(({ vers, etat, teinte, estompe }) => (
        <Pointe
          key={vers}
          orientation={orientation}
          position={POSITIONS[vers]}
          etat={etat}
          teinte={teinte}
          estompe={estompe}
        />
      ))}
    </>
  )
}

const ICONES = {
  demande: Inbox,
  prevalide: CircleCheck,
  valide: BadgeCheck,
  realise: PackageCheck,
  refuse: CircleX,
  reporte: CalendarClock,
  // 2e niveau (150) : mêmes cases, après la prévalidation.
  refuse2: CircleX,
  reporte2: CalendarClock,
} satisfies Record<string, LucideIcon>

type CleCase = keyof typeof ICONES

/**
 * Couleur de la case où se trouve le projet : celle de son STADE, posée par
 * `SchemaCapex` dans la variable --parcours (demande PO du 12/11/2026).
 */
const COULEUR_PARCOURS = 'var(--parcours)'

function styleActuel(): CSSProperties {
  const c = COULEUR_PARCOURS
  return {
    borderColor: c,
    // Mélange en sRGB : en oklch, la teinte « nulle » de --card tirait le
    // vert vers le brun.
    backgroundColor: `color-mix(in srgb, ${c} 13%, var(--card))`,
    boxShadow: `0 0 0 4px color-mix(in oklch, ${c} 16%, transparent), 0 8px 24px -8px color-mix(in oklch, ${c} 55%, transparent)`,
  }
}

/** Un montant affiché dans une case (ex. « 6 260,26 € » / « demandé »). */
export interface ChiffreCapex {
  valeur: string
  /**
   * Légende sous la valeur, SEULEMENT pour un chiffre secondaire (l'écart) :
   * le montant principal est celui de l'étape — « Demandé » puis
   * « demandé » sous la somme ferait doublon.
   */
  libelle?: string
  /** Dépassement : valeur en couleur d'alerte. */
  alerte?: boolean
}

export type ChiffresCapex = Partial<Record<CleCase, ChiffreCapex[]>>

function Case({
  cle,
  c,
  chiffres = [],
  date,
  texte,
  menu = [],
  estompe = false,
  onAction,
  disabled,
}: {
  cle: CleCase
  c: CaseCapex
  chiffres?: ChiffreCapex[]
  date?: string
  /** Texte de l'étape, quelques lignes (la suite au survol). */
  texte?: string | null
  /** Branche écartée : la case s'efface. */
  estompe?: boolean
  /** Menu du clic droit / appui long (vide = pas de menu). */
  menu?: RowAction[]
  onAction?: (a: ActionCapex) => void
  disabled?: boolean
}) {
  const [refTexte, tronque] = useTexteTronque(texte)
  const tuile = (
    <TuileCase
      {...{ cle, c, chiffres, date, texte, estompe, onAction, disabled }}
      refTexte={refTexte}
    />
  )
  // Au survol : le texte de l'étape, et seulement s'il est COUPÉ dans la
  // case (demande PO) ; au clic droit : son menu.
  return (
    <SurvolCase texte={tronque ? texte : null} menu={menu}>
      {tuile}
    </SurvolCase>
  )
}

function TuileCase({
  cle,
  c,
  chiffres,
  date,
  texte,
  refTexte,
  estompe,
  onAction,
  disabled,
  ...rest
}: {
  cle: CleCase
  c: CaseCapex
  chiffres: ChiffreCapex[]
  date?: string
  texte?: string | null
  /** Pour savoir si le texte est coupé (infobulle). */
  refTexte?: (el: HTMLElement | null) => void
  estompe: boolean
  onAction?: (a: ActionCapex) => void
  disabled?: boolean
} & Omit<ComponentProps<'div'>, 'children'>) {
  // `rest` = ce que le menu contextuel (`asChild`) pose sur la case : ref,
  // écouteur du clic droit / appui long. Étalé AVANT nos propres attributs.
  const Icone = c.etat === 'fait' ? Check : ICONES[cle]
  // Refus et report du 2e niveau ont l'allure de ceux du 1er.
  const genre =
    cle === 'refuse2' ? 'refuse' : cle === 'reporte2' ? 'reporte' : cle
  const actuel = c.etat === 'actuel'
  const couleur = actuel && c.statutId ? COULEUR_PARCOURS : undefined
  const contenu = (
    <>
      {/* Pas d'icône pour la proposition (demande PO) : son texte prend la
          place. */}
      {cle !== 'demande' && (
        <>
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full',
              c.etat === 'fait' &&
                'bg-(color:--parcours)/15 text-(color:--parcours)',
              // Case libre : sa couleur de branche, en pâle — refus rouge,
              // report jaune.
              c.etat === 'libre' &&
                (genre === 'refuse'
                  ? 'bg-destructive/10 text-destructive'
                  : genre === 'reporte'
                    ? 'bg-warning/15 text-warning'
                    : 'bg-muted text-muted-foreground'),
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
        </>
      )}
      {/* Nom de l'étape, sa date, puis son texte quand ils existent. */}
      <span className="flex min-w-0 flex-col items-center leading-tight @min-[15rem]:items-start @min-[15rem]:text-left">
        <span>{c.libelle}</span>
        {date && (
          <span className="mt-0.5 text-[11px] font-normal whitespace-pre-line text-muted-foreground tabular-nums">
            {date}
          </span>
        )}
        {texte?.trim() && (
          <span
            ref={refTexte}
            className={cn(
              'mt-1.5 text-xs leading-snug font-normal whitespace-pre-line text-muted-foreground',
              // La proposition se lit EN ENTIER (la case grandit avec son
              // texte) ; au-delà d'une quinzaine de lignes, la suite au survol.
              cle === 'demande' ? 'line-clamp-[15]' : 'line-clamp-4',
            )}
          >
            {texte}
          </span>
        )}
      </span>
      {/* Les montants : à droite dans une case large, dessous dans une case
          étroite. */}
      {chiffres.length > 0 && (
        <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 @min-[15rem]:ml-auto @min-[15rem]:flex-nowrap">
          {chiffres.map((ch) => (
            <span
              key={ch.libelle ?? 'principal'}
              className="flex flex-col items-center @min-[15rem]:items-end"
            >
              <span
                className={cn(
                  'text-xs font-semibold whitespace-nowrap text-foreground tabular-nums @min-[15rem]:text-sm',
                  ch.alerte && 'text-warning',
                )}
              >
                {ch.valeur}
              </span>
              {ch.libelle && (
                <span className="text-[11px] font-normal text-muted-foreground">
                  {ch.libelle}
                </span>
              )}
            </span>
          ))}
        </span>
      )}
    </>
  )
  const classes = cn(
    // Case ÉTROITE (< 15rem) : icône, nom et montant EMPILÉS et centrés.
    // Case LARGE : sur une ligne, montant à droite. La largeur est celle de la
    // case (requête de conteneur), pas celle de l'écran. Toutes les cases se
    // calent comme « Demandé » : icône, nom, puis montant poussé à droite.
    'flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl border bg-card px-2 py-2.5 text-center text-sm font-medium shadow-xs @min-[15rem]:flex-row @min-[15rem]:justify-start @min-[15rem]:gap-3 @min-[15rem]:px-4',
    c.etat === 'fait' && 'border-(color:--parcours)/40',
    c.etat === 'libre' && 'text-muted-foreground',
    c.etat === 'libre' && genre === 'refuse' && 'border-destructive/25',
    actuel && 'border-2 font-semibold text-foreground',
    genre === 'reporte' && 'border-dashed border-warning/50',
    estompe &&
      cn(
        ESTOMPE,
        'transition duration-150 hover:opacity-100 hover:saturate-100 focus-visible:opacity-100 focus-visible:saturate-100',
      ),
  )
  if (c.action && onAction) {
    const action = c.action
    return (
      <button
        {...(rest as ComponentProps<'button'>)}
        type="button"
        disabled={disabled}
        onClick={() => onAction(action)}
        // Pas d'infobulle native quand le survol montre déjà le texte.
        title={
          texte?.trim()
            ? undefined
            : genre === 'reporte'
              ? c.libelle
              : action.cle === 'deprevalider'
                ? 'Retirer la prévalidation'
                : action.cle === 'devalider' && actuel
                  ? 'Retirer la confirmation'
                  : actuel
                    ? `Modifier « ${c.libelle} »`
                    : `Passer à « ${c.libelle} »`
        }
        style={actuel && c.statutId ? styleActuel() : undefined}
        aria-current={actuel ? 'step' : undefined}
        className={cn(
          classes,
          'cursor-pointer transition duration-150 hover:-translate-y-0.5 hover:text-foreground hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          // Au survol, la couleur de l'étape visée.
          genre === 'refuse'
            ? 'hover:border-destructive/60'
            : genre === 'reporte'
              ? 'hover:border-warning'
              : cle === 'prevalide'
                ? 'hover:border-yellow/70'
                : cle === 'valide'
                  ? 'hover:border-info/60'
                  : cle === 'realise'
                    ? 'hover:border-success/60'
                    : 'hover:border-muted-foreground/60',
        )}
      >
        {contenu}
      </button>
    )
  }
  return (
    <div
      {...rest}
      className={classes}
      style={actuel && c.statutId ? styleActuel() : undefined}
      aria-current={actuel ? 'step' : undefined}
    >
      {contenu}
    </div>
  )
}

/** Ligne(s) sous le nom d'une case : sa date (un saut de ligne entre deux lignes). */
export type DatesCasesCapex = Partial<Record<CleCase, string>>

/** Disposition de la colonne des devis : rangées égales (large) ou pile (étroit). */
export type ModeDevis = 'grille' | 'pile'

/** Les devis retenus, réunis avant la décision (pastille du schéma). */
export interface SelectionCapex {
  nb: number
  /** Somme des retenus, déjà formatée. */
  montant: string
}

interface PropsSchema {
  schema: Schema
  /** Couleur du stade du projet (`toneProjet`) : chemin parcouru, case actuelle. */
  ton?: StatusTone
  /** Menus du clic droit / appui long, par case (selon la situation du dossier). */
  menus?: Partial<Record<CleCase, RowAction[]>>
  /**
   * Colonne des DEVIS (147, demande PO) entre la proposition et la décision.
   * Rendue par l'hôte, une fois par disposition : en grille (large), elle
   * occupe `rangeesDevis` rangées égales ; en pile (étroit), l'une sous
   * l'autre.
   */
  renderDevis?: (mode: ModeDevis) => ReactNode
  /** Les devis, dans l'ordre de la colonne : seul « retenu » compte ici. */
  devis?: readonly { retenu: boolean }[]
  /** Rangées de la colonne : les devis + la tuile « Ajouter » s'il y en a une. */
  rangeesDevis?: number
  /** Devis retenus réunis ; null = aucun encore. */
  selection?: SelectionCapex | null
  chiffres?: ChiffresCapex
  dates?: DatesCasesCapex
  /** Texte d'une étape : proposition, motif du refus, bilan (demande PO). */
  textes?: Partial<Record<CleCase, string | null>>
  onAction?: (a: ActionCapex) => void
  disabled?: boolean
}

/** Liens de la fourche qui part de la sélection. */
function liensFourche(schema: Schema) {
  const f = schema.fleches
  const e = estompees(schema)
  return [
    {
      vers: 0 as const,
      etat: f.versRefuse,
      teinte: 'refus' as const,
      estompe: e.has('refuse'),
    },
    { vers: 1 as const, etat: f.versPrevalide, estompe: e.has('prevalide') },
    {
      vers: 2 as const,
      etat: f.versReporte,
      teinte: 'report' as const,
      estompe: e.has('reporte'),
    },
  ]
}

/**
 * Cases des branches ÉCARTÉES, niveau par niveau (150) : un niveau franchi
 * efface son refus et son report ; un refus efface ce qui le suit. Les
 * branches effacées restent cliquables (le survol les rend nettes).
 */
function estompees(schema: Schema): Set<CleCase> {
  if (schema.refuse.etat === 'actuel')
    return new Set([
      'prevalide',
      'valide',
      'realise',
      'reporte',
      'refuse2',
      'reporte2',
    ])
  if (schema.refuse2.etat === 'actuel')
    return new Set(['refuse', 'reporte', 'valide', 'realise', 'reporte2'])
  if (schema.valide.etat !== 'libre')
    return new Set(['refuse', 'reporte', 'refuse2', 'reporte2'])
  if (schema.prevalide.etat !== 'libre') return new Set(['refuse', 'reporte'])
  return new Set()
}

/** Liens de la 2e fourche, qui part de « Prévalidé » (150). */
function liensFourche2(schema: Schema) {
  const f = schema.fleches
  const e = estompees(schema)
  return [
    {
      vers: 0 as const,
      etat: f.versRefuse2,
      teinte: 'refus' as const,
      estompe: e.has('refuse2'),
    },
    { vers: 1 as const, etat: f.versValide, estompe: e.has('valide') },
    {
      vers: 2 as const,
      etat: f.versReporte2,
      teinte: 'report' as const,
      estompe: e.has('reporte2'),
    },
  ]
}

/** Le projet a-t-il passé le 1er accord (prévalidé ou plus) ? */
const choixFait = (schema: Schema) => schema.prevalide.etat !== 'libre'

/** Trait simple d'une case de la ligne d'accord à la suivante. */
function LienSuite({
  orientation,
  etat,
  estompe,
}: {
  orientation: Orientation
  etat: EtatFlecheCapex
  estompe: boolean
}) {
  return (
    <Liens orientation={orientation} liens={[{ vers: 1, etat, estompe }]} />
  )
}

/**
 * Courbes LIBRES d'une colonne à l'autre, en pourcentages de hauteur (0-100) :
 * du bord gauche à la hauteur `de` au bord droit à la hauteur `vers`. Sert
 * aux faisceaux dont le nombre de branches varie (un devis = une branche).
 */
function Courbes({
  traits,
}: {
  traits: {
    cle: string
    de: number
    vers: number
    etat: EtatTrait
    estompe?: boolean
    /** Pointe à l'arrivée (sinon le trait rejoint un autre élément). */
    pointe?: boolean
  }[]
}) {
  const ordonnes = [...traits].sort(
    (a, b) => Number(a.etat !== 'libre') - Number(b.etat !== 'libre'),
  )
  const avecPointes = traits.some((t) => t.pointe)
  return (
    <>
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className={cn(
          'absolute top-0 left-0 h-full overflow-visible',
          avecPointes ? 'w-[calc(100%-0.625rem)]' : 'w-full',
        )}
      >
        {ordonnes.map(({ cle, de, vers, etat, estompe }) => {
          const t = styleTrait(etat)
          return (
            <path
              key={cle}
              d={`M0 ${String(de)} C55 ${String(de)} 45 ${String(vers)} 100 ${String(vers)}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={t.epais}
              strokeDasharray={t.pointille}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={cn(t.className, estompe && ESTOMPE)}
            />
          )
        })}
      </svg>
      {traits
        .filter((t) => t.pointe)
        .map(({ cle, vers, etat, estompe }) => (
          <Pointe
            key={cle}
            orientation="h"
            position={`${String(vers)}%`}
            etat={etat}
            estompe={estompe}
          />
        ))}
    </>
  )
}

/** Centre (en %) de la rangée `i` sur `n` rangées égales. */
const centre = (i: number, n: number) => ((i + 0.5) / n) * 100

/**
 * Pastille où se RÉUNISSENT les devis retenus (demande PO) : on en voit le
 * nombre et la somme ; la décision (Prévalidé / Refusé / Reporter) part d'elle.
 */
function Pastille({
  selection,
  valide,
}: {
  selection: SelectionCapex | null
  valide: boolean
}) {
  // Rien de coché : un simple point gris où se rejoignent les pointillés —
  // pas de texte (demande PO).
  if (selection === null)
    return (
      <span
        aria-hidden
        className="size-2.5 rounded-full bg-muted-foreground/40"
      />
    )
  return (
    <span
      className={cn(
        'flex flex-col items-center rounded-full border px-3 py-1 text-center text-[11px] leading-tight whitespace-nowrap shadow-xs',
        'border-(color:--parcours)/50 bg-(color:--parcours)/10 text-foreground',
        valide && 'font-medium',
      )}
    >
      <span>
        {selection.nb} devis retenu{selection.nb > 1 ? 's' : ''}
      </span>
      <span className="font-semibold tabular-nums">{selection.montant} HT</span>
    </span>
  )
}

/**
 * Hauteur d'une rangée du schéma large : une tuile (4rem) et son souffle.
 * Le schéma garde sa hauteur NATURELLE (demande PO : resserré au bureau) —
 * une rangée par devis, jamais étirée sur tout l'écran.
 */
const RANGEE_REM = 4.75

/**
 * Le schéma, de gauche à droite (demande PO) :
 *
 *   Proposition ─▶ devis ☑ ─╮                  ╭─▶ Refusé
 *   (son texte)  ─▶ devis ☐  ├─(2 devis · X €)─┼─▶ Prévalidé ─▶ Confirmé ─▶ Réalisé
 *                ─▶ devis ☑ ─╯                  ╰─▶ Reporter
 *
 * Chaque colonne a SES rangées égales sur la même hauteur : les centres se
 * calculent (`centre`), les courbes les relient.
 */
function SchemaHorizontal({
  schema,
  menus,
  renderDevis,
  devis = [],
  rangeesDevis = 0,
  selection = null,
  chiffres,
  dates,
  textes,
  onAction,
  disabled,
}: PropsSchema) {
  const props = { onAction, disabled }
  const e = estompees(schema)
  const fait = choixFait(schema)
  const k = Math.max(rangeesDevis, 1)
  const cellule = 'flex items-center py-2 @container'
  const case_ = (cle: CleCase) => (
    <Case
      cle={cle}
      c={schema[cle]}
      chiffres={chiffres?.[cle]}
      date={dates?.[cle]}
      texte={textes?.[cle]}
      menu={menus?.[cle]}
      estompe={e.has(cle)}
      {...props}
    />
  )
  return (
    <div
      className="mx-auto grid w-full max-w-[96rem] grid-cols-[minmax(0,1.15fr)_minmax(2rem,0.25fr)_minmax(0,1.1fr)_minmax(8.5rem,0.7fr)_minmax(0,1fr)_minmax(2rem,0.25fr)_minmax(0,1fr)_minmax(2rem,0.25fr)_minmax(0,1fr)]"
      style={{ minHeight: `${String(Math.max(k, 3) * RANGEE_REM)}rem` }}
    >
      {/* 1. La proposition, avec son texte. */}
      <div className={cellule}>{case_('demande')}</div>

      {/* 2. Proposition → chaque devis (et vers « Ajouter »). */}
      <div className="relative">
        <Courbes
          traits={Array.from({ length: k }, (_, i) => {
            const d = devis[i]
            return {
              cle: String(i),
              de: 50,
              vers: centre(i, k),
              etat: d?.retenu ? (fait ? 'ok' : 'choisi') : 'libre',
              estompe: fait && !d?.retenu,
              pointe: true,
            }
          })}
        />
      </div>

      {/* 3. Les devis, une rangée chacun. */}
      <div className="flex">{renderDevis?.('grille')}</div>

      {/* 4. Devis retenus → pastille → décision. */}
      <div className="flex items-stretch">
        <div className="relative min-w-3 flex-1">
          <Courbes
            // Rien de coché : TOUS les devis rejoignent la pastille, en
            // pointillés gris (demande PO) — il reste à choisir.
            traits={devis.flatMap((d, i) =>
              d.retenu || selection === null
                ? [
                    {
                      cle: String(i),
                      de: centre(i, k),
                      vers: 50,
                      etat: !d.retenu
                        ? ('libre' as const)
                        : fait
                          ? ('ok' as const)
                          : ('choisi' as const),
                    },
                  ]
                : [],
            )}
          />
        </div>
        <div className="flex items-center">
          <Pastille selection={selection} valide={fait} />
        </div>
        <div className="relative min-w-6 flex-1">
          <Liens orientation="h" liens={liensFourche(schema)} />
        </div>
      </div>

      {/* 5. La décision. */}
      <div className="grid grid-rows-3">
        <div className={cellule}>{case_('refuse')}</div>
        <div className={cellule}>{case_('prevalide')}</div>
        <div className={cellule}>{case_('reporte')}</div>
      </div>

      {/* 6. Prévalidé → Refusé / Confirmé / Reporter (150). */}
      <div className="relative">
        <Liens orientation="h" liens={liensFourche2(schema)} />
      </div>
      <div className="grid grid-rows-3">
        <div className={cellule}>{case_('refuse2')}</div>
        <div className={cellule}>{case_('valide')}</div>
        <div className={cellule}>{case_('reporte2')}</div>
      </div>

      {/* 7. Confirmé → Réalisé. */}
      <div className="relative">
        <LienSuite
          orientation="h"
          etat={schema.fleches.versRealise}
          estompe={e.has('realise')}
        />
      </div>
      <div className="grid grid-rows-3">
        <div className={cn(cellule, 'row-start-2')}>{case_('realise')}</div>
      </div>
    </div>
  )
}

/** Trait pointillé vertical court, entre deux blocs du schéma étroit. */
function TraitVertical({ etat = 'libre' }: { etat?: EtatTrait }) {
  return (
    <div
      aria-hidden
      className={cn(
        'mx-auto h-4 w-0 border-l-2',
        etat === 'libre' ? 'border-dashed border-muted-foreground/40' : '',
        (etat === 'choisi' || etat === 'ok') && 'border-(color:--parcours)',
      )}
    />
  )
}

/**
 * Schéma ÉTROIT (téléphone, tablette, fenêtre réduite) : de haut en bas,
 * dans la toile navigable (demande PO).
 */
function SchemaVertical({
  schema,
  menus,
  renderDevis,
  selection = null,
  chiffres,
  dates,
  textes,
  onAction,
  disabled,
}: PropsSchema) {
  const props = { onAction, disabled }
  const e = estompees(schema)
  const fait = choixFait(schema)
  const trois = 'grid grid-cols-3'
  const cellule = 'flex px-1 @container'
  const case_ = (cle: CleCase) => (
    <Case
      cle={cle}
      c={schema[cle]}
      chiffres={chiffres?.[cle]}
      date={dates?.[cle]}
      texte={textes?.[cle]}
      menu={menus?.[cle]}
      estompe={e.has(cle)}
      {...props}
    />
  )
  return (
    <div className="w-full">
      <div className={cellule}>{case_('demande')}</div>
      <TraitVertical />
      <div className="@container flex px-1">{renderDevis?.('pile')}</div>
      <TraitVertical
        etat={selection === null ? 'libre' : fait ? 'ok' : 'choisi'}
      />
      <div className="flex justify-center">
        <Pastille selection={selection} valide={fait} />
      </div>
      <div className="relative h-12">
        <Liens orientation="v" liens={liensFourche(schema)} />
      </div>
      <div className={trois}>
        <div className={cellule}>{case_('refuse')}</div>
        <div className={cellule}>{case_('prevalide')}</div>
        <div className={cellule}>{case_('reporte')}</div>
      </div>
      <div className="relative h-12">
        <Liens orientation="v" liens={liensFourche2(schema)} />
      </div>
      <div className={trois}>
        <div className={cellule}>{case_('refuse2')}</div>
        <div className={cellule}>{case_('valide')}</div>
        <div className={cellule}>{case_('reporte2')}</div>
      </div>
      <div className="relative h-10">
        <LienSuite
          orientation="v"
          etat={schema.fleches.versRealise}
          estompe={e.has('realise')}
        />
      </div>
      <div className={trois}>
        <div className={cn(cellule, 'col-start-2')}>{case_('realise')}</div>
      </div>
    </div>
  )
}

/**
 * Schéma du parcours d'un projet, sur un fond « toile » pointillé (demande
 * PO) : la proposition, ses devis, ceux qu'on retient, puis la décision. La
 * case colorée = où en est le projet ; un clic sur une autre case y fait
 * passer le projet (rôles qui peuvent modifier, sinon lecture seule).
 *
 * S'adapte à la place RÉELLE (demande PO) : de gauche à droite quand elle
 * suffit ; sinon de haut en bas, dans un cadre qui défile verticalement (`ToileSchema`).
 */
export function SchemaCapex({ ton = 'neutral', ...props }: PropsSchema) {
  return (
    <div
      role="group"
      aria-label="Parcours du projet"
      className="flex flex-1 flex-col rounded-lg"
      style={{
        // Couleur du chemin parcouru = celle du stade du projet.
        ['--parcours' as string]: toneToken(ton),
        backgroundImage:
          'radial-gradient(color-mix(in oklch, var(--muted-foreground) 22%, transparent) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
      }}
    >
      <ToileSchema
        large={
          // Centré dans la place disponible, sans s'y étirer.
          <div className="flex flex-1 flex-col justify-center px-3 py-6 sm:px-6">
            <SchemaHorizontal {...props} />
          </div>
        }
        etroit={
          <div className="px-2 py-5">
            <SchemaVertical {...props} />
          </div>
        }
      />
    </div>
  )
}
