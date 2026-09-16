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
import {
  choisirGranularite,
  cleConforme,
  cleDates,
  cleOt,
  cleRemplacement,
  cleValeur,
  construireDonneesColonnes,
  construireDonneesLigne,
  echantillonner,
  genererReperes,
  labelDateComplete,
  labelRepere,
  reperesEtiquettesColonnes,
  type LigneDonnees,
  type PointTemporel,
  type SerieTemporelle,
} from '@/components/common/charts/temporel'
import { parseDateLocale } from '@/lib/date'
import { cn } from '@/lib/utils'

// Le modèle de données et toute la logique calendaire vivent dans `temporel.ts`
// (fonctions pures, testables) ; les types restent exportés ici pour les
// consommateurs historiques.
export type { PointTemporel, SerieTemporelle }

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

/** Largeur estimée nécessaire par étiquette (« janv. 26 », police 11px). */
const LARGEUR_ETIQUETTE_PX = 56

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
