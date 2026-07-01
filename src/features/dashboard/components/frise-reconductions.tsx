import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Truck } from 'lucide-react'
import {
  onKeyActivate,
  toneToken,
} from '@/components/common/charts/chart-legend'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import type { StatusTone } from '@/components/common/status-badge'
import {
  ajouterJoursIso,
  ajouterMoisIso,
  TYPE_CONTRAT,
} from '@/features/prestataires/etat'
import { prestatairesQueries } from '@/features/prestataires/queries'
import {
  useFenetreTemporelle,
  type FenetreTemporelle,
} from '@/features/planning/use-fenetre-temporelle'
import { useColonnesAuto } from '@/features/planning/use-colonnes-auto'
import { formatDate, todayLocal } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import { DashboardCard } from './dashboard-card'
import { dashboardQueries } from '../queries'

interface FriseReconductionsProps {
  siteId: string
  /**
   * Fenêtre temporelle DÉJÀ construite, fournie par l'orchestrateur pour PARTAGER
   * un unique `centre` + un unique listener clavier avec les barres du planning
   * (cf. `cadran-barres-planning.tsx`). Absente → la frise monte SA PROPRE fenêtre
   * (mode autonome).
   *
   * ⚠️ Anti double-listener : on ne monte JAMAIS deux `useFenetreTemporelle`. Le
   * choix autonome/piloté est STABLE sur la vie du composant → une seule branche
   * (`FriseAutonome`) instancie le hook (donc le seul `keydown`) ; la branche
   * pilotée n'en instancie aucun et se contente du `centre` reçu.
   */
  fenetre?: FenetreTemporelle
}

/**
 * Frise chronologique « Reconductions de contrats » (zone 2 du tableau de bord),
 * façon mini-Gantt : chaque ÉCHÉANCE (fin d'un déterminé, reconduction d'un tacite)
 * est précédée d'une BARRE = sa PÉRIODE DE PRÉAVIS (`delai_preavis_jours` avant
 * l'échéance), avec un jalon coloré à l'échéance. Début et résiliations restent des
 * POINTS. « Aujourd'hui » en pointillés au premier tiers, axe des mois, année en
 * filigrane, couleurs par nature (tokens sémantiques), anti-chevauchement vertical,
 * tooltip (avec vignette prestataire), clic → fiche prestataire. Le `centre` est
 * PARTAGÉ avec les barres (mêmes flèches clavier).
 */
export function FriseReconductions({
  siteId,
  fenetre,
}: FriseReconductionsProps) {
  if (fenetre) return <FriseVue siteId={siteId} fenetre={fenetre} />
  return <FriseAutonome siteId={siteId} />
}

/**
 * Mode autonome : la frise mesure sa propre largeur pour un `nbSemaines`
 * responsive (portée temporelle) et instancie SA fenêtre temporelle. C'est
 * l'unique branche qui installe un listener clavier.
 */
function FriseAutonome({ siteId }: { siteId: string }) {
  const mesureRef = useRef<HTMLDivElement>(null)
  const { nbSemaines } = useColonnesAuto(mesureRef)
  const fenetre = useFenetreTemporelle({ nbSemaines })
  return <FriseVue siteId={siteId} fenetre={fenetre} mesureRef={mesureRef} />
}

// ── Natures d'événement (couleur) ─────────────────────────────────────────────
type NatureCle =
  | 'debut'
  | 'renouvellement'
  | 'imminent'
  | 'preavis'
  | 'resiliation'
  | 'passe'

interface NatureDef {
  label: string
  tone: StatusTone
  losange?: boolean
}

/** Mapping nature → token/forme. Aucune couleur en dur : tout passe par `tone`. */
const NATURE_DEF: Record<NatureCle, NatureDef> = {
  debut: { label: 'Début', tone: 'success' },
  renouvellement: { label: 'Renouvellement', tone: 'info' },
  imminent: { label: 'Échéance < 30 j', tone: 'destructive' },
  preavis: { label: 'Préavis', tone: 'warning' },
  resiliation: { label: 'Résiliation', tone: 'violet', losange: true },
  passe: { label: 'Passé', tone: 'neutral' },
}

// ── Géométrie du SVG (PIXELS RÉELS : le viewBox épouse la largeur mesurée → pas
// d'agrandissement quand la carte s'élargit ; éléments fins) ───────────────────
const R = 5
const LANE_H = 16
const AXE_H = 22
const POINTS_TOP = AXE_H + R + 6
const BARRE_H = R * 1.6 // épaisseur de la barre de préavis
const GAP = R * 1.2 // espace mini entre deux éléments d'une même ligne
const BAS = 16 // place réservée en bas pour « Aujourd'hui »
const JOUR = 86_400_000

const FMT_MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

/** Millisecondes (minuit local) d'une date nue `YYYY-MM-DD`. */
function msDeIso(iso: string): number {
  const [a, m, j] = iso.split('-')
  return new Date(Number(a), Number(m) - 1, Number(j)).getTime()
}

/** Nombre de jours de `aIso` à `bIso` (signé), en heure locale. */
function joursEntre(aIso: string, bIso: string): number {
  return Math.round((msDeIso(bIso) - msDeIso(aIso)) / JOUR)
}

/** « aujourd'hui » / « dans N j » / « il y a N j » à partir d'un écart en jours. */
function labelEcart(diff: number): string {
  if (diff === 0) return "aujourd'hui"
  if (diff > 0) return `dans ${String(diff)} j`
  return `il y a ${String(-diff)} j`
}

/** Nature d'une ÉCHÉANCE selon sa proximité : passé / imminent (<30 j) / lointain. */
function natureEcheance(echeanceIso: string, todayIso: string): NatureCle {
  const diff = joursEntre(todayIso, echeanceIso)
  if (diff < 0) return 'passe'
  if (diff < 30) return 'imminent'
  return 'renouvellement'
}

type KindPoint = 'debut' | 'resiliation'

/** Jalon ponctuel (point) : début du contrat ou résiliation déclarée. */
interface PointBrut {
  contratId: string
  prestataireId: string
  prestataireLibelle: string
  date: string
  evenement: string
  kind: KindPoint
}

/** Barre de préavis d'une échéance : `[echeance − delai_preavis ; echeance]`. */
interface BarreBrute {
  contratId: string
  prestataireId: string
  prestataireLibelle: string
  debut: string
  echeance: string
  delaiPreavis: number
  echeanceEvenement: string
}

/** Élément projeté (point OU barre) prêt au rendu, avec sa ligne (anti-chevauchement). */
type Element = {
  cle: string
  prestataireId: string
  prestataireLibelle: string
  lane: number
  /** Centre X (ancrage du tooltip). */
  xc: number
  /** Empreinte [gauche, droite] pour l'affectation des lignes. */
  x0: number
  x1: number
} & (
  | {
      type: 'point'
      nature: NatureCle
      evenement: string
      date: string
      forme: 'dot' | 'diamond'
    }
  | {
      type: 'barre'
      barX0: number
      barX1: number
      debut: string
      echeance: string
      delaiPreavis: number
      echeanceEvenement: string
      echeanceNature: NatureCle
      ouverte: boolean
    }
)

interface FriseVueProps {
  siteId: string
  fenetre: FenetreTemporelle
  /** Ref de mesure (mode autonome seulement) : porte le calcul `useColonnesAuto`. */
  mesureRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Rendu pur de la frise à partir d'une fenêtre temporelle (fournie ou autonome) :
 * ne monte AUCUN `useFenetreTemporelle` (pas de listener clavier ici) → sûr à
 * afficher aux côtés des barres sans double bond. Mesure sa propre largeur pour
 * dessiner en pixels réels (pas d'agrandissement sur grand écran).
 */
function FriseVue({ siteId, fenetre, mesureRef }: FriseVueProps) {
  const navigate = useNavigate()
  const { data: contrats } = useQuery(dashboardQueries.contratsFrise(siteId))
  const { data: prestataires } = useQuery(prestatairesQueries.list())
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const [survol, setSurvol] = useState<string | null>(null)

  // Image du prestataire (vignette) par id → affichée dans le tooltip.
  const miniatureParPresta = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const p of prestataires ?? []) m.set(p.id, p.miniature_id)
    return m
  }, [prestataires])

  // Largeur réelle du conteneur → `viewW` (le viewBox est en pixels 1:1).
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [largeur, setLargeur] = useState(0)
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    let raf = 0
    const relever = () =>
      setLargeur((p) => (p === el.clientWidth ? p : el.clientWidth))
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
  // Ref partagée : mesure interne (viewW) + `mesureRef` du mode autonome (nbSemaines).
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      boxRef.current = el
      if (mesureRef) mesureRef.current = el
    },
    [mesureRef],
  )
  const viewW = largeur || 1000

  const modele = useMemo(() => {
    // Densité des mois : ~un mois tous les ~60 px → beaucoup de mois, bien rapprochés.
    // La portée temporelle en découle (indépendante des barres : seul le `centre` est
    // partagé, pour la navigation clavier).
    const moisCible = Math.max(6, Math.round(viewW / 60))
    const porteeJours = Math.round(moisCible * 30.44)
    // Layout « aujourd'hui au premier tiers » : ~1/3 de passé à gauche, ~2/3 de futur.
    const offsetPasse = Math.round(porteeJours / 3)
    const centreMs = fenetre.centre.getTime()
    const t0ms = centreMs - offsetPasse * JOUR
    const t1ms = centreMs + (porteeJours - offsetPasse) * JOUR
    const projX = (ms: number) => ((ms - t0ms) / (t1ms - t0ms)) * viewW
    const clampMs = (ms: number) => Math.min(Math.max(ms, t0ms), t1ms)

    const todayIso = todayLocal()
    const todayMs = msDeIso(todayIso)

    // ── Dérivation des jalons ──────────────────────────────────────────────────
    const points: PointBrut[] = []
    const barres: BarreBrute[] = []
    for (const c of contrats ?? []) {
      const base = {
        contratId: c.id,
        prestataireId: c.prestataire_id,
        prestataireLibelle: c.prestataires.libelle,
      }
      const dp = c.delai_preavis_jours || 30

      // Début du contrat.
      points.push({
        ...base,
        date: c.date_debut,
        evenement: 'Début du contrat',
        kind: 'debut',
      })

      // Barre de préavis d'une échéance : [échéance − dp ; échéance].
      const pushEcheance = (echeance: string, evenement: string) => {
        const debut = ajouterJoursIso(echeance, -dp)
        if (!debut) return
        barres.push({
          ...base,
          debut,
          echeance,
          delaiPreavis: dp,
          echeanceEvenement: evenement,
        })
      }

      if (c.type_contrat_id === TYPE_CONTRAT.determine) {
        if (c.date_fin) pushEcheance(c.date_fin, 'Fin du contrat')
      } else if (
        c.type_contrat_id === TYPE_CONTRAT.tacite &&
        c.duree_cycle_mois &&
        c.duree_cycle_mois > 0
      ) {
        // Reconductions couvrant la fenêtre (barre = préavis en amont de chacune).
        let k = 1
        let d = ajouterMoisIso(c.date_debut, c.duree_cycle_mois * k)
        while (d && msDeIso(d) <= t1ms + dp * JOUR && k < 10_000) {
          if (msDeIso(d) >= t0ms) pushEcheance(d, 'Reconduction')
          k += 1
          d = ajouterMoisIso(c.date_debut, c.duree_cycle_mois * k)
        }
      }

      // Résiliation déclarée (notification puis résiliation) → points.
      if (c.date_notification)
        points.push({
          ...base,
          date: c.date_notification,
          evenement: 'Notification de résiliation',
          kind: 'resiliation',
        })
      if (c.date_resiliation)
        points.push({
          ...base,
          date: c.date_resiliation,
          evenement: 'Résiliation',
          kind: 'resiliation',
        })
    }

    // ── Projection + empreinte X (points ET barres, lignes communes) ───────────
    interface Occ {
      x0: number
      x1: number
      build: (lane: number) => Element
    }
    const occ: Occ[] = []

    for (const p of points) {
      const ms = msDeIso(p.date)
      if (ms < t0ms || ms > t1ms) continue
      const xc = projX(ms)
      const nature: NatureCle =
        p.kind === 'resiliation' ? 'resiliation' : 'debut'
      occ.push({
        x0: xc - R,
        x1: xc + R,
        build: (lane) => ({
          type: 'point',
          cle: `pt-${p.contratId}-${p.kind}-${p.date}`,
          prestataireId: p.prestataireId,
          prestataireLibelle: p.prestataireLibelle,
          lane,
          xc,
          x0: xc - R,
          x1: xc + R,
          nature,
          evenement: p.evenement,
          date: p.date,
          forme: NATURE_DEF[nature].losange ? 'diamond' : 'dot',
        }),
      })
    }

    for (const b of barres) {
      const msD = msDeIso(b.debut)
      const msE = msDeIso(b.echeance)
      if (msE < t0ms || msD > t1ms) continue
      const bx0 = projX(clampMs(msD))
      const bx1 = Math.max(projX(clampMs(msE)), bx0 + R * 2)
      const ouverte = todayMs >= msD && todayMs <= msE
      const echeanceNature = natureEcheance(b.echeance, todayIso)
      occ.push({
        x0: bx0,
        x1: bx1 + R, // réserve la place du jalon d'échéance au bout droit
        build: (lane) => ({
          type: 'barre',
          cle: `bar-${b.contratId}-${b.echeance}`,
          prestataireId: b.prestataireId,
          prestataireLibelle: b.prestataireLibelle,
          lane,
          xc: (bx0 + bx1) / 2,
          x0: bx0,
          x1: bx1 + R,
          barX0: bx0,
          barX1: bx1,
          debut: b.debut,
          echeance: b.echeance,
          delaiPreavis: b.delaiPreavis,
          echeanceEvenement: b.echeanceEvenement,
          echeanceNature,
          ouverte,
        }),
      })
    }

    // ── Affectation des lignes (anti-chevauchement, points ET barres ensemble) ──
    occ.sort((a, b) => a.x0 - b.x0)
    const lanesRight: number[] = []
    const elements: Element[] = occ.map((o) => {
      let lane = lanesRight.findIndex((r) => o.x0 >= r + GAP)
      if (lane === -1) {
        lane = lanesRight.length
        lanesRight.push(o.x1)
      } else {
        lanesRight[lane] = o.x1
      }
      return o.build(lane)
    })

    const nbLanes = Math.max(lanesRight.length, 1)
    const hauteur = POINTS_TOP + nbLanes * LANE_H + BAS

    // ── Axe des mois (anti-chevauchement) + filigrane ──────────────────────────
    const mois: { x: number; label: string }[] = []
    let cur = new Date(
      new Date(t0ms).getFullYear(),
      new Date(t0ms).getMonth(),
      1,
    )
    let dernierMoisX = -Infinity
    while (cur.getTime() <= t1ms) {
      const x = projX(cur.getTime())
      if (x >= 0 && x <= viewW && x - dernierMoisX >= 34) {
        mois.push({ x, label: FMT_MOIS.format(cur) })
        dernierMoisX = x
      }
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }

    const todayX = projX(todayMs)
    return {
      elements,
      hauteur,
      mois,
      todayX,
      todayVisible: todayX >= 0 && todayX <= viewW,
      filigrane: String(fenetre.centre.getFullYear()),
    }
  }, [contrats, fenetre.centre, viewW])

  const ouvrir = (prestataireId: string) => {
    const liste = prestataires ?? []
    const siblings = liste.map((p) => ({ nom: p.libelle, id: p.id }))
    const presta = liste.find((p) => p.id === prestataireId)
    const prestataire = presta
      ? segOfUnique({ nom: presta.libelle, id: presta.id }, siblings)
      : prestataireId
    void navigate({ to: '/prestataires/$prestataire', params: { prestataire } })
  }

  const cyDe = (lane: number) => POINTS_TOP + lane * LANE_H
  const survolElem = modele.elements.find((e) => e.cle === survol) ?? null

  return (
    <DashboardCard icon={CalendarClock} title="Reconductions de contrats">
      <div ref={setRefs} className="relative">
        {modele.elements.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Aucune reconduction de contrat sur la période.
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${String(viewW)} ${String(modele.hauteur)}`}
              width={viewW}
              height={modele.hauteur}
              role="img"
              aria-label="Frise des reconductions de contrats"
              className="block"
            >
              {/* Année en filigrane. */}
              <text
                x={viewW / 2}
                y={modele.hauteur * 0.66}
                textAnchor="middle"
                style={{
                  fill: 'var(--muted-foreground)',
                  opacity: 0.07,
                  fontSize: modele.hauteur * 0.55,
                  fontWeight: 700,
                }}
              >
                {modele.filigrane}
              </text>

              {/* Axe des mois : trait fin + libellé centré en haut. */}
              {modele.mois.map((m, i) => (
                <g key={`mois-${String(i)}`}>
                  <line
                    x1={m.x}
                    y1={AXE_H}
                    x2={m.x}
                    y2={modele.hauteur}
                    stroke="var(--border)"
                    strokeWidth={1}
                  />
                  <text
                    x={m.x}
                    y={AXE_H - 7}
                    textAnchor="middle"
                    style={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
                  >
                    {m.label}
                  </text>
                </g>
              ))}

              {/* « Aujourd'hui » : trait vertical pointillé + libellé centré EN BAS. */}
              {modele.todayVisible && (
                <>
                  <line
                    x1={modele.todayX}
                    y1={AXE_H - 3}
                    x2={modele.todayX}
                    y2={modele.hauteur - BAS + 2}
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    opacity={0.7}
                  />
                  <text
                    x={modele.todayX}
                    y={modele.hauteur - 4}
                    textAnchor="middle"
                    style={{
                      fill: 'var(--muted-foreground)',
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                  >
                    {"Aujourd'hui"}
                  </text>
                </>
              )}

              {/* Éléments : barres de préavis (+ jalon d'échéance) et points. */}
              {modele.elements.map((e) => {
                const aria =
                  e.type === 'barre'
                    ? `${e.prestataireLibelle} — Préavis ${String(e.delaiPreavis)} j avant ${e.echeanceEvenement.toLowerCase()} du ${formatDate(e.echeance)}`
                    : `${e.prestataireLibelle} — ${NATURE_DEF[e.nature].label} · ${e.evenement} · ${formatDate(e.date)} · ${labelEcart(joursEntre(todayLocal(), e.date))}`
                const cy = cyDe(e.lane)
                return (
                  <g
                    key={e.cle}
                    role="button"
                    tabIndex={0}
                    aria-label={aria}
                    className="cursor-pointer outline-none"
                    onClick={() => ouvrir(e.prestataireId)}
                    onKeyDown={onKeyActivate(() => ouvrir(e.prestataireId))}
                    onMouseEnter={() => setSurvol(e.cle)}
                    onMouseLeave={() => setSurvol(null)}
                    onFocus={() => setSurvol(e.cle)}
                    onBlur={() => setSurvol(null)}
                  >
                    {e.type === 'barre' ? (
                      // Barre continue = période de préavis (couleur = proximité de
                      // l'échéance, bouts arrondis, sans point final).
                      <rect
                        x={e.barX0}
                        y={cy - BARRE_H / 2}
                        width={Math.max(e.barX1 - e.barX0, R * 2)}
                        height={BARRE_H}
                        rx={BARRE_H / 2}
                        fill={toneToken(NATURE_DEF[e.echeanceNature].tone)}
                        opacity={e.ouverte ? 1 : survol === e.cle ? 0.9 : 0.65}
                      >
                        <title>{aria}</title>
                      </rect>
                    ) : e.forme === 'diamond' ? (
                      <polygon
                        points={`${String(e.xc)},${String(cy - R)} ${String(e.xc + R)},${String(cy)} ${String(e.xc)},${String(cy + R)} ${String(e.xc - R)},${String(cy)}`}
                        fill={toneToken(NATURE_DEF[e.nature].tone)}
                      >
                        <title>{aria}</title>
                      </polygon>
                    ) : (
                      <circle
                        cx={e.xc}
                        cy={cy}
                        r={R}
                        fill={toneToken(NATURE_DEF[e.nature].tone)}
                      >
                        <title>{aria}</title>
                      </circle>
                    )}
                    {/* Zone de capture élargie (hauteur d'une ligne). */}
                    <rect
                      x={e.x0 - 4}
                      y={cy - LANE_H / 2}
                      width={e.x1 - e.x0 + 8}
                      height={LANE_H}
                      fill="transparent"
                    />
                  </g>
                )
              })}
            </svg>

            {survolElem && (
              <div
                className="bg-popover text-popover-foreground pointer-events-none absolute z-10 flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs shadow-md"
                style={{
                  left: `${String((survolElem.xc / viewW) * 100)}%`,
                  top: `${String((cyDe(survolElem.lane) / modele.hauteur) * 100)}%`,
                  transform: 'translate(-50%, calc(-100% - 8px))',
                }}
              >
                <div className="bg-muted size-9 shrink-0 overflow-hidden rounded">
                  <MiniatureThumb
                    url={urlOf(
                      miniatureParPresta.get(survolElem.prestataireId) ?? null,
                    )}
                    fallback={<Truck className="size-4" />}
                    alt=""
                    onError={refreshMiniatures}
                    className="size-full rounded-none"
                  />
                </div>
                <div>
                  <div className="font-medium">
                    {survolElem.prestataireLibelle}
                  </div>
                  {survolElem.type === 'barre' ? (
                    <>
                      <div className="text-muted-foreground whitespace-nowrap">
                        Préavis {survolElem.delaiPreavis} j
                        {survolElem.ouverte ? ' · en cours' : ''}
                      </div>
                      <div className="text-muted-foreground whitespace-nowrap">
                        {survolElem.echeanceEvenement} le{' '}
                        {formatDate(survolElem.echeance)} ·{' '}
                        {labelEcart(
                          joursEntre(todayLocal(), survolElem.echeance),
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-muted-foreground whitespace-nowrap">
                        {NATURE_DEF[survolElem.nature].label} ·{' '}
                        {survolElem.evenement}
                      </div>
                      <div className="text-muted-foreground whitespace-nowrap">
                        {formatDate(survolElem.date)} ·{' '}
                        {labelEcart(joursEntre(todayLocal(), survolElem.date))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardCard>
  )
}
