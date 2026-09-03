import { useLayoutEffect, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { toneToken } from '@/components/common/charts/chart-tokens'
import { isoLocale, parseDateLocale } from '@/lib/date'
import { cn } from '@/lib/utils'

export interface PointTemporel {
  /** Date RÉELLE du point (ISO) — jamais arrondie à un bucket, cf. pipeline Relevés. */
  date: string
  valeur: number | null
  /** Conformité (mode « ligne » uniquement) — colore ET change la forme du point. */
  conforme?: boolean | null
  /** Relevé de remplacement de compteur (index dépose/pose) — signalé dans le tooltip. */
  remplacement?: boolean
  otId: string
}

export interface SerieTemporelle {
  cle: string
  label: string
  points: PointTemporel[]
  /**
   * Seuils PROPRES à cette série (mode « ligne » uniquement) — une série peut
   * n'avoir qu'un seuil haut, qu'un seuil bas, les deux, ou aucun ; chacune porte
   * les siens indépendamment des autres séries du même graphique (deux mesures
   * du même groupe, ex. Température E.C.S/E.F.S, ont souvent des seuils
   * différents). Tracé dans la MÊME couleur que la série, comme l'ancien système.
   */
  seuilMinimum?: number | null
  seuilMaximum?: number | null
}

interface ChartTemporelProps {
  /**
   * Domaine de dates partagé entre tous les graphiques d'une gamme, pour aligner
   * visuellement leurs axes X. `null`/absent → domaine calculé sur les données du
   * graphique seul.
   */
  domaine?: { debut: string; fin: string } | null
  series: SerieTemporelle[]
  /** « ligne » : mesures (seuils, conformité). « colonnes » : compteurs (consommation). */
  mode: 'ligne' | 'colonnes'
  uniteSymbole: string
  onPointClick?: (otId: string) => void
  className?: string
}

// 5 tons validés (skill dataviz, `validate_palette.js`) — ordre FIXE, jamais cyclé
// au hasard. Au-delà de 5 séries dans un même graphique (rarissime dans ce jeu de
// données), les tons se répètent : au-delà de ~4 séries la couleur seule cesse
// d'être fiable de toute façon (cf. `references/color-formula.md`).
const CHART_COLOR_VARS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

// ─────────────────────────────────────────────────────────────────────────
// Granularité de l'axe temporel — repères TOUJOURS posés sur une frontière de
// calendrier propre (1er du mois / du trimestre / de l'année), jamais sur le
// quantième d'un relevé (qui varie sans logique visible d'une occurrence à
// l'autre). La granularité la plus fine dont les repères tiennent dans la
// largeur mesurée est choisie automatiquement — même principe que
// `d3.scaleTime().ticks()` : on ne sous-échantillonne pas une grille fixe, on
// choisit l'UNITÉ de la grille selon l'étendue affichée. Sur une période courte
// (3 mois) → un repère par mois ; sur un historique de plusieurs années (« Tout »)
// → l'axe bascule automatiquement au trimestre puis à l'année plutôt que de
// garder un repère « mois » sur deux ou trois au hasard.
type Granularite = 'mois' | 'trimestre' | 'annee'

const FR_MOIS_ANNEE = new Intl.DateTimeFormat('fr-FR', {
  month: 'short',
  year: '2-digit',
})
const FR_ANNEE = new Intl.DateTimeFormat('fr-FR', { year: 'numeric' })
// Info-bulle au survol : date complète, précise, sans ambiguïté d'année.
const FR_DATE_COMPLETE = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function labelRepere(dateMs: number, granularite: Granularite): string {
  return granularite === 'annee'
    ? FR_ANNEE.format(new Date(dateMs))
    : FR_MOIS_ANNEE.format(new Date(dateMs))
}
function labelDateComplete(dateMs: number): string {
  return FR_DATE_COMPLETE.format(new Date(dateMs))
}

/**
 * Date « logique » pour RATTACHER un relevé à sa période de calendrier — jamais
 * pour sa position réelle sur l'axe ni pour le tooltip (qui gardent la date
 * exacte). Un relevé fait le 15 du mois ou avant est un relevé de FIN du mois
 * PRÉCÉDENT (le releveur clôture parfois son passage avec quelques jours de
 * retard sur le mois suivant) — sans ce rattachement, un mois où il y a
 * pourtant un relevé (juste enregistré 1-2 jours en retard) serait compté à
 * tort comme vide dans le mode colonnes (repère manquant, faux « trou »).
 */
function dateLogique(date: Date): Date {
  return date.getDate() <= 15
    ? new Date(date.getFullYear(), date.getMonth(), 0)
    : date
}

/** 1er jour de la période (mois/trimestre/année) contenant `date`, à minuit local. */
function debutPeriode(date: Date, granularite: Granularite): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1)
  if (granularite === 'trimestre') d.setMonth(Math.floor(d.getMonth() / 3) * 3)
  else if (granularite === 'annee') d.setMonth(0)
  return d
}

function periodeSuivante(date: Date, granularite: Granularite): Date {
  const d = new Date(date)
  if (granularite === 'annee') d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + (granularite === 'trimestre' ? 3 : 1))
  return d
}

/** Repères (frontières de calendrier) de `granularite` couvrant [debutMs, finMs]. */
function genererReperes(
  granularite: Granularite,
  debutMs: number,
  finMs: number,
): number[] {
  const reperes: number[] = []
  let curseur = debutPeriode(new Date(debutMs), granularite)
  while (curseur.getTime() <= finMs) {
    reperes.push(curseur.getTime())
    curseur = periodeSuivante(curseur, granularite)
  }
  return reperes
}

/** La granularité la plus FINE dont les repères tiennent dans `maxReperes`. */
function choisirGranularite(
  debutMs: number,
  finMs: number,
  maxReperes: number,
): Granularite {
  for (const g of ['mois', 'trimestre', 'annee'] as const) {
    if (genererReperes(g, debutMs, finMs).length <= maxReperes) return g
  }
  return 'annee'
}

/**
 * Filet de sécurité : réduit `items` à au plus `max`, TOUJOURS le premier et le
 * dernier, répartis uniformément — au cas où même la granularité « année » ne
 * tiendrait pas dans un conteneur extrêmement étroit.
 */
function echantillonner<T>(items: T[], max: number): T[] {
  if (max < 1 || items.length === 0) return []
  if (items.length <= max) return items
  if (max === 1) return [items[items.length - 1]!]
  const pas = (items.length - 1) / (max - 1)
  const retenus = new Set<number>()
  for (let i = 0; i < max; i += 1) retenus.add(Math.round(i * pas))
  return items.filter((_, i) => retenus.has(i))
}

/** Largeur estimée nécessaire par étiquette (« janv. 26 », police 11px). */
const LARGEUR_ETIQUETTE_PX = 56

type LigneDonnees = Record<string, string | number | null>

/** Clé de la valeur d'une série dans une ligne de données du graphique. */
function cleValeur(serieCle: string): string {
  return serieCle
}
function cleConforme(serieCle: string): string {
  return `${serieCle}__conforme`
}
function cleOt(serieCle: string): string {
  return `${serieCle}__ot`
}
function cleDates(serieCle: string): string {
  return `${serieCle}__dates`
}
function cleRemplacement(serieCle: string): string {
  return `${serieCle}__remplacement`
}

/**
 * Une ligne par date RÉELLE distincte (union de toutes les séries) — jamais de
 * bucket : les tâches d'une même gamme sont exécutées ensemble dans le même OT,
 * donc leurs dates coïncident déjà naturellement d'une série à l'autre. Aucun
 * risque de collision (contrairement à l'ancien bucket mensuel, qui écrasait ou
 * dispersait les points dès qu'une gamme avait plus d'un relevé par mois).
 */
function construireDonneesLigne(series: SerieTemporelle[]): LigneDonnees[] {
  const dates = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.date))),
  ].sort()
  return dates.map((date) => {
    const ligne: LigneDonnees = { date, dateMs: new Date(date).getTime() }
    for (const s of series) {
      const point = s.points.find((p) => p.date === date)
      ligne[cleValeur(s.cle)] = point?.valeur ?? null
      ligne[cleConforme(s.cle)] =
        point?.conforme === true ? 1 : point?.conforme === false ? 0 : null
      ligne[cleOt(s.cle)] = point?.otId ?? null
    }
    return ligne
  })
}

/**
 * Une colonne par date RÉELLE distincte — RIEN n'est jamais additionné, moyenné
 * ni fusionné : chaque relevé garde sa propre colonne, toujours, y compris en
 * mode « Tout ». Seules les ÉTIQUETTES de l'axe (cf. `reperesEtiquettesColonnes`)
 * sont choisies avec parcimonie pour rester lisibles — exactement comme le mode
 * ligne, où l'axe n'affiche pas une étiquette par relevé sans que les points
 * eux-mêmes disparaissent pour autant.
 *
 * Des colonnes VIDES (sans aucun relevé) sont ajoutées à chaque frontière de
 * calendrier qui n'a aucune donnée — pas pour fusionner quoi que ce soit, mais
 * pour qu'une fenêtre « 3 mois » avec un seul relevé montre bien ses 3 mois
 * complets plutôt qu'une colonne isolée collée à un bord.
 */
function construireDonneesColonnes(
  series: SerieTemporelle[],
  granularite: Granularite,
  debutMs: number,
  finMs: number,
): LigneDonnees[] {
  const reelles = new Set(series.flatMap((s) => s.points.map((p) => p.date)))
  // `isoLocale` (jamais `.toISOString()`, qui convertit en UTC et décale la date
  // d'un jour — parfois d'un MOIS entier ici, un « 1er du mois » minuit local
  // proche du changement de fuseau retombant sur le 30 du mois précédent en UTC).
  const periodesAvecDonnee = new Set(
    [...reelles].map((d) =>
      isoLocale(debutPeriode(dateLogique(new Date(d)), granularite)),
    ),
  )
  const periodesVides = genererReperes(granularite, debutMs, finMs)
    .map((ms) => isoLocale(new Date(ms)))
    .filter((cle) => !periodesAvecDonnee.has(cle))
  const dates = [...reelles, ...periodesVides].sort()

  return dates.map((date) => {
    const ligne: LigneDonnees = {
      date,
      dateMs: parseDateLocale(date).getTime(),
    }
    for (const s of series) {
      const point = s.points.find((p) => p.date === date && p.valeur !== null)
      ligne[cleValeur(s.cle)] = point?.valeur ?? null
      ligne[cleConforme(s.cle)] = null // compteurs : pas de conformité
      ligne[cleOt(s.cle)] = point?.otId ?? null
      ligne[cleDates(s.cle)] = point
        ? `le ${labelDateComplete(new Date(point.date).getTime())}`
        : null
      ligne[cleRemplacement(s.cle)] = point?.remplacement ? 1 : null
    }
    return ligne
  })
}

/**
 * Étiquettes de l'axe (mode colonnes) : une par période de calendrier couverte
 * — la PREMIÈRE colonne (réelle ou vide) rencontrée à partir de chaque
 * frontière porte l'étiquette. Ne change RIEN aux colonnes elles-mêmes
 * (`construireDonneesColonnes` reste inchangée) — uniquement lesquelles, parmi
 * toutes les colonnes déjà là, reçoivent un texte lisible sous l'axe.
 */
function reperesEtiquettesColonnes(
  dates: string[],
  granularite: Granularite,
  max: number,
): string[] {
  const candidats: string[] = []
  const periodesVues = new Set<string>()
  for (const date of dates) {
    const periode = isoLocale(
      debutPeriode(dateLogique(parseDateLocale(date)), granularite),
    )
    if (!periodesVues.has(periode)) {
      periodesVues.add(periode)
      candidats.push(date)
    }
  }
  return echantillonner(candidats, max)
}

interface DotRenduProps {
  cx?: number
  cy?: number
  payload?: LigneDonnees
}

/** Point coloré ET formé par conformité (jamais la couleur seule) — vert plein
 * (conforme), rouge plein (non conforme), creux neutre (pas de seuil). */
function pointConformite(
  serieCle: string,
  onPointClick?: (otId: string) => void,
) {
  return function DotConformite(props: DotRenduProps) {
    const { cx, cy, payload } = props
    if (cx === undefined || cy === undefined || !payload) return null
    const conforme = payload[cleConforme(serieCle)]
    const otId = payload[cleOt(serieCle)]
    if (payload[cleValeur(serieCle)] === null) return null
    const tone =
      conforme === 1 ? 'success' : conforme === 0 ? 'destructive' : 'neutral'
    const interactif = Boolean(onPointClick && typeof otId === 'string')
    const declencher =
      interactif && typeof otId === 'string'
        ? () => onPointClick!(otId)
        : undefined
    return (
      <g>
        {/* Point VISIBLE, petit — la couleur/forme porte l'info, pas la taille. */}
        <circle
          cx={cx}
          cy={cy}
          r={2.5}
          fill={conforme === null ? 'var(--card)' : toneToken(tone)}
          stroke={toneToken(tone)}
          strokeWidth={1.5}
          className="pointer-events-none"
        />
        {/* Zone de clic invisible, plus large — un point de 5 px resterait
            difficile à viser sinon (souris comme tactile). */}
        {interactif && (
          <circle
            cx={cx}
            cy={cy}
            r={9}
            fill="transparent"
            className="cursor-pointer"
            onClick={declencher}
          />
        )}
      </g>
    )
  }
}

interface BarClicItem {
  payload?: LigneDonnees
}

/**
 * Graphique temporel (ligne pour les mesures, colonnes pour les compteurs), sur
 * Recharts via la coquille shadcn (`ChartContainer`). Axe X toujours étiqueté sur
 * des repères de CALENDRIER propres (1er du mois, du trimestre ou de l'année —
 * jamais le quantième d'un relevé), à la granularité la plus fine qui tient dans
 * la largeur mesurée du graphique :
 * - mode « ligne » : axe numérique continu (échelle temporelle proportionnelle),
 *   chaque relevé garde sa date réelle ; aligné entre les graphiques d'une même
 *   gamme via `domaine`. Aucune ligne n'est jamais tracée à travers un vrai trou
 *   de données (`connectNulls` désactivé).
 * - mode « colonnes » : axe catégoriel, une colonne PAR RELEVÉ RÉEL (jamais
 *   fusionné — cf. `construireDonneesColonnes`) ; seules les étiquettes sous
 *   l'axe sont espacées pour rester lisibles.
 */
export function ChartTemporel({
  domaine,
  series,
  mode,
  uniteSymbole,
  onPointClick,
  className,
}: ChartTemporelProps) {
  const conteneurRef = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState(0)

  useLayoutEffect(() => {
    const el = conteneurRef.current
    if (!el) return
    let raf = 0
    const relever = () =>
      setLargeur((prev) => (prev === el.clientWidth ? prev : el.clientWidth))
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

  const maxEtiquettes = Math.max(2, Math.floor(largeur / LARGEUR_ETIQUETTE_PX))

  const toutesDates = series.flatMap((s) => s.points.map((p) => p.date))
  const bornes = domaine
    ? {
        // `parseDateLocale`, jamais `new Date(isoNu)` : une date NUE `AAAA-MM-JJ`
        // se parse en UTC et peut retomber sur la veille (voire le mois d'avant)
        // selon le fuseau local — cf. commentaire de `construireDonneesColonnes`.
        min: parseDateLocale(domaine.debut).getTime(),
        max: parseDateLocale(domaine.fin).getTime(),
      }
    : toutesDates.length > 0
      ? {
          min: Math.min(...toutesDates.map((d) => new Date(d).getTime())),
          max: Math.max(...toutesDates.map((d) => new Date(d).getTime())),
        }
      : { min: 0, max: 0 } // aucun point : le graphique n'affichera rien de toute façon
  const granularite = choisirGranularite(bornes.min, bornes.max, maxEtiquettes)

  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.cle,
      { label: s.label, color: CHART_COLOR_VARS[i % CHART_COLOR_VARS.length] },
    ]),
  )

  // Remplace le rendu par défaut du tooltip (icône + libellé + valeur) : on y ajoute
  // le SYMBOLE de l'unité après la valeur (même agencement : pastille de couleur,
  // libellé à gauche, valeur alignée à droite, chiffres tabulaires) et, en mode
  // colonnes, la date EXACTE du relevé sous la ligne — le repère de l'axe n'est
  // qu'une période (mois/trimestre/année), jamais le jour précis du relevé.
  const formatterValeur = (
    value: number | string | readonly (number | string)[] | undefined,
    name: number | string | undefined,
    item: { color?: string; dataKey?: unknown; payload?: LigneDonnees },
  ) => {
    const dateExacte =
      mode === 'colonnes' && typeof item.dataKey === 'string'
        ? item.payload?.[cleDates(item.dataKey)]
        : null
    const remplacement =
      mode === 'colonnes' &&
      typeof item.dataKey === 'string' &&
      item.payload?.[cleRemplacement(item.dataKey)] === 1
    return (
      <div className="flex w-full flex-col gap-0.5">
        <div className="flex w-full items-center gap-2">
          <div
            className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
            style={{ backgroundColor: item.color }}
          />
          <div className="flex flex-1 items-center justify-between gap-2">
            <span className="text-muted-foreground">{name}</span>
            <span className="font-mono font-medium text-foreground tabular-nums">
              {typeof value === 'number'
                ? value.toLocaleString('fr-FR')
                : value}{' '}
              {uniteSymbole}
              {remplacement && '*'}
            </span>
          </div>
        </div>
        {typeof dateExacte === 'string' && (
          <span className="pl-4.5 text-[11px] text-muted-foreground">
            {dateExacte}
            {remplacement && ' · * changement de compteur'}
          </span>
        )}
      </div>
    )
  }
  // `labelFormatter` du tooltip : Recharts type `label` en `ReactNode` (générique
  // à toutes ses utilisations), mais c'est ici toujours la valeur brute du dataKey
  // de l'axe (`dateMs` en nombre, `date` en chaîne ISO selon le mode).
  const labelFormatterLigne = (label: unknown) =>
    typeof label === 'number' ? labelDateComplete(label) : ''
  // Mode colonnes : le repère est une PÉRIODE (mois/trimestre/année), jamais un
  // jour précis — afficher une date complète suggérerait à tort un relevé unique.
  const labelFormatterColonnes = (label: unknown) =>
    typeof label === 'string'
      ? labelRepere(parseDateLocale(label).getTime(), granularite)
      : ''

  if (mode === 'colonnes') {
    const donnees = construireDonneesColonnes(
      series,
      granularite,
      bornes.min,
      bornes.max,
    )
    const ticksColonnes = reperesEtiquettesColonnes(
      donnees.map((l) => l.date as string),
      granularite,
      maxEtiquettes,
    )

    return (
      <div ref={conteneurRef} className="h-full w-full">
        <ChartContainer
          config={config}
          className={cn('aspect-auto h-full w-full', className)}
        >
          <BarChart data={donnees} barGap={4} barCategoryGap="20%">
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              ticks={ticksColonnes}
              fontSize={11}
              tickFormatter={(v: string) =>
                labelRepere(parseDateLocale(v).getTime(), granularite)
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              fontSize={11}
              tickFormatter={(v: number) => v.toLocaleString('fr-FR')}
            />
            <ChartTooltip
              labelFormatter={labelFormatterColonnes}
              content={<ChartTooltipContent formatter={formatterValeur} />}
            />
            {series.length > 1 && (
              <ChartLegend content={<ChartLegendContent />} />
            )}
            {series.map((s, i) => (
              <Bar
                key={s.cle}
                dataKey={cleValeur(s.cle)}
                name={s.label}
                fill={CHART_COLOR_VARS[i % CHART_COLOR_VARS.length]}
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
                isAnimationActive={false}
                onClick={
                  onPointClick
                    ? (item: BarClicItem) => {
                        const otId = item.payload?.[cleOt(s.cle)]
                        if (typeof otId === 'string') onPointClick(otId)
                      }
                    : undefined
                }
                className={onPointClick ? 'cursor-pointer' : undefined}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </div>
    )
  }

  const donnees = construireDonneesLigne(series)
  const ticksLigne = echantillonner(
    genererReperes(granularite, bornes.min, bornes.max),
    maxEtiquettes,
  )

  return (
    <div ref={conteneurRef} className="h-full w-full">
      <ChartContainer
        config={config}
        className={cn('aspect-auto h-full w-full', className)}
      >
        <LineChart data={donnees}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="dateMs"
            type="number"
            scale="time"
            domain={[bornes.min, bornes.max]}
            ticks={ticksLigne}
            tickLine={false}
            axisLine={false}
            fontSize={11}
            tickFormatter={(v: number) => labelRepere(v, granularite)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            fontSize={11}
            domain={['auto', 'auto']}
            tickFormatter={(v: number) => v.toLocaleString('fr-FR')}
          />
          <ChartTooltip
            labelFormatter={labelFormatterLigne}
            content={<ChartTooltipContent formatter={formatterValeur} />}
          />
          {series.length > 1 && (
            <ChartLegend content={<ChartLegendContent />} />
          )}
          {/* Seuils PROPRES à chaque série — indépendants des autres séries du
              même graphique (l'une peut n'avoir qu'un seuil haut, une autre
              qu'un bas, une troisième les deux ou aucun) ; même couleur que sa
              série pour rattacher visuellement le seuil à sa mesure, exclus de
              la légende et du tooltip. `flatMap` (jamais un `<g>` enveloppant) :
              Recharts repère ses éléments par les enfants DIRECTS de `<LineChart>`. */}
          {series.flatMap((s, i) => {
            const couleur = CHART_COLOR_VARS[i % CHART_COLOR_VARS.length]
            const lignes = []
            if (s.seuilMinimum !== null && s.seuilMinimum !== undefined) {
              lignes.push(
                <ReferenceLine
                  key={`${s.cle}-min`}
                  y={s.seuilMinimum}
                  stroke={couleur}
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />,
              )
            }
            if (s.seuilMaximum !== null && s.seuilMaximum !== undefined) {
              lignes.push(
                <ReferenceLine
                  key={`${s.cle}-max`}
                  y={s.seuilMaximum}
                  stroke={couleur}
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />,
              )
            }
            return lignes
          })}
          {series.map((s, i) => (
            <Line
              key={s.cle}
              type="monotone"
              dataKey={cleValeur(s.cle)}
              name={s.label}
              stroke={CHART_COLOR_VARS[i % CHART_COLOR_VARS.length]}
              strokeWidth={2}
              connectNulls={false}
              isAnimationActive={false}
              dot={pointConformite(s.cle, onPointClick)}
              activeDot={pointConformite(s.cle, onPointClick)}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  )
}
