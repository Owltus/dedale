import { useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import {
  ChartLegend,
  onKeyActivate,
  toneToken,
} from '@/components/common/charts/chart-legend'
import type { StatusTone } from '@/components/common/status-badge'
import {
  ajouterMoisIso,
  fenetrePreavisContrat,
  TYPE_CONTRAT,
  type DonneesContrat,
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
 * Frise chronologique « Reconductions de contrats » (zone 2 du tableau de bord).
 * Ligne de temps HORIZONTALE des événements de contrats (début, reconductions,
 * préavis, résiliation), « aujourd'hui » en pointillés au premier tiers, axe des
 * mois + année en filigrane, points colorés par nature (tokens sémantiques),
 * anti-chevauchement vertical, tooltip riche, clic → fiche prestataire.
 *
 * Le `centre` est PARTAGÉ avec les barres (même `useFenetreTemporelle`) → les
 * flèches clavier déplacent barres ET frise de la même période.
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

// ── Natures d'événement (catégories de la légende) ────────────────────────────
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
  halo?: boolean
  losange?: boolean
}

/** Mapping nature → token/forme. Aucune couleur en dur : tout passe par `tone`. */
const NATURE_DEF: Record<NatureCle, NatureDef> = {
  debut: { label: 'Début', tone: 'success' },
  renouvellement: { label: 'Renouvellement', tone: 'info' },
  imminent: { label: 'Échéance < 30 j', tone: 'destructive' },
  preavis: { label: 'Préavis ouvert', tone: 'warning', halo: true },
  resiliation: { label: 'Résiliation', tone: 'violet', losange: true },
  passe: { label: 'Passé', tone: 'neutral' },
}

/** Ordre stable des natures dans la légende. */
const ORDRE_NATURES: NatureCle[] = [
  'debut',
  'renouvellement',
  'imminent',
  'preavis',
  'resiliation',
  'passe',
]

// ── Géométrie du SVG (unités de viewBox ; largeur réelle = 100%) ──────────────
const VIEW_W = 1000
const R = 9
const LANE_H = 26
const AXE_H = 30
const POINTS_TOP = AXE_H + R + 6
/** Écart X minimal (unités viewBox) sous lequel deux points passent sur des lignes différentes. */
const MIN_DX = R * 2.4
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

type KindEvenement = 'debut' | 'echeance' | 'preavis' | 'resiliation'

interface PointBrut {
  contratId: string
  prestataireId: string
  prestataireLibelle: string
  date: string
  evenement: string
  kind: KindEvenement
  /** Fenêtre de préavis ouverte aujourd'hui (pertinent seulement pour `preavis`). */
  ouverte: boolean
}

interface PointCalc extends PointBrut {
  cle: string
  ms: number
  x: number
  lane: number
  nature: NatureCle
}

/**
 * Nature d'un point selon son type et sa position temporelle :
 * résiliation → violet ; préavis ouvert → warning ; passé → gris ; début à venir →
 * vert ; échéance < 30 j → rouge ; sinon renouvellement lointain → bleu.
 */
function natureDe(p: PointBrut, todayIso: string): NatureCle {
  if (p.kind === 'resiliation') return 'resiliation'
  if (p.kind === 'preavis' && p.ouverte) return 'preavis'
  const diff = joursEntre(todayIso, p.date)
  if (diff < 0) return 'passe'
  if (p.kind === 'debut') return 'debut'
  if (diff < 30) return 'imminent'
  return 'renouvellement'
}

interface FriseVueProps {
  siteId: string
  fenetre: FenetreTemporelle
  /** Ref de mesure (mode autonome seulement) : porte le calcul `useColonnesAuto`. */
  mesureRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Rendu pur de la frise à partir d'une fenêtre temporelle (fournie ou autonome) :
 * ne monte AUCUN `useFenetreTemporelle` (pas de listener clavier ici) → sûr à
 * afficher aux côtés des barres sans double bond.
 */
function FriseVue({ siteId, fenetre, mesureRef }: FriseVueProps) {
  const navigate = useNavigate()
  const { data: contrats } = useQuery(dashboardQueries.contratsFrise(siteId))
  const { data: prestataires } = useQuery(prestatairesQueries.list())
  const [survol, setSurvol] = useState<string | null>(null)

  const modele = useMemo(() => {
    const nbSem = fenetre.semaines.length || 1
    const porteeJours = nbSem * 7
    // Layout « aujourd'hui au premier tiers » : ~1/3 de passé à gauche, ~2/3 de
    // futur à droite. La fenêtre suit le `centre` partagé → les flèches décalent
    // barres + frise ensemble (même `PAS_NAV`, car même `centre`).
    const offsetPasse = Math.round(porteeJours / 3)
    const centreMs = fenetre.centre.getTime()
    const t0ms = centreMs - offsetPasse * JOUR
    const t1ms = centreMs + (porteeJours - offsetPasse) * JOUR
    const projX = (ms: number) => ((ms - t0ms) / (t1ms - t0ms)) * VIEW_W

    const todayIso = todayLocal()
    const todayMs = msDeIso(todayIso)

    // ── Dérivation des événements (via l'API `etat.ts`) ────────────────────────
    const bruts: PointBrut[] = []
    for (const c of contrats ?? []) {
      const prestataireLibelle = c.prestataires.libelle
      const base = {
        contratId: c.id,
        prestataireId: c.prestataire_id,
        prestataireLibelle,
      }
      const donnees: DonneesContrat = {
        type_contrat_id: c.type_contrat_id,
        date_debut: c.date_debut,
        date_fin: c.date_fin,
        date_signature: c.date_signature,
        date_resiliation: c.date_resiliation,
        date_notification: c.date_notification,
        delai_preavis_jours: c.delai_preavis_jours,
        duree_cycle_mois: c.duree_cycle_mois,
        fenetre_resiliation_jours: c.fenetre_resiliation_jours,
      }

      // Début du contrat.
      bruts.push({
        ...base,
        date: c.date_debut,
        evenement: 'Début du contrat',
        kind: 'debut',
        ouverte: false,
      })

      // Échéances : fin (déterminé) ou reconductions MULTIPLES (tacite) couvrant
      // la fenêtre visible (itère `date_debut + k×cycle` tant que ≤ t1).
      if (c.type_contrat_id === TYPE_CONTRAT.determine) {
        if (c.date_fin)
          bruts.push({
            ...base,
            date: c.date_fin,
            evenement: 'Fin du contrat',
            kind: 'echeance',
            ouverte: false,
          })
      } else if (
        c.type_contrat_id === TYPE_CONTRAT.tacite &&
        c.duree_cycle_mois &&
        c.duree_cycle_mois > 0
      ) {
        let k = 1
        let d = ajouterMoisIso(c.date_debut, c.duree_cycle_mois * k)
        while (d && msDeIso(d) <= t1ms && k < 10_000) {
          if (msDeIso(d) >= t0ms)
            bruts.push({
              ...base,
              date: d,
              evenement: 'Reconduction',
              kind: 'echeance',
              ouverte: false,
            })
          k += 1
          d = ajouterMoisIso(c.date_debut, c.duree_cycle_mois * k)
        }
      }

      // Fenêtre de préavis de la prochaine échéance.
      const preavis = fenetrePreavisContrat(donnees, todayIso)
      if (preavis.fin)
        bruts.push({
          ...base,
          date: preavis.fin,
          evenement: 'Dernier jour pour résilier',
          kind: 'preavis',
          ouverte: preavis.ouverte,
        })
      if (preavis.debut)
        bruts.push({
          ...base,
          date: preavis.debut,
          evenement: 'Ouverture du préavis',
          kind: 'preavis',
          ouverte: preavis.ouverte,
        })

      // Résiliation déclarée (notification puis résiliation).
      if (c.date_notification)
        bruts.push({
          ...base,
          date: c.date_notification,
          evenement: 'Notification de résiliation',
          kind: 'resiliation',
          ouverte: false,
        })
      if (c.date_resiliation)
        bruts.push({
          ...base,
          date: c.date_resiliation,
          evenement: 'Résiliation',
          kind: 'resiliation',
          ouverte: false,
        })
    }

    // ── Projection + anti-chevauchement (empilement par collision de X) ────────
    const dansFenetre = bruts
      .map((p) => ({ ...p, ms: msDeIso(p.date) }))
      .filter((p) => p.ms >= t0ms && p.ms <= t1ms)
      .sort((a, b) => a.ms - b.ms)

    const lanesLastX: number[] = []
    const points: PointCalc[] = dansFenetre.map((p, i) => {
      const x = projX(p.ms)
      let lane = lanesLastX.findIndex((lx) => x - lx >= MIN_DX)
      if (lane === -1) {
        lane = lanesLastX.length
        lanesLastX.push(x)
      } else {
        lanesLastX[lane] = x
      }
      return {
        ...p,
        cle: `${p.contratId}-${p.kind}-${p.date}-${String(i)}`,
        x,
        lane,
        nature: natureDe(p, todayIso),
      }
    })

    const nbLanes = Math.max(lanesLastX.length, 1)
    const hauteur = POINTS_TOP + nbLanes * LANE_H + 6

    // ── Axe des mois + année en filigrane ──────────────────────────────────────
    const mois: { x: number; label: string }[] = []
    let cur = new Date(
      new Date(t0ms).getFullYear(),
      new Date(t0ms).getMonth(),
      1,
    )
    while (cur.getTime() <= t1ms) {
      const x = projX(cur.getTime())
      if (x >= 0 && x <= VIEW_W) mois.push({ x, label: FMT_MOIS.format(cur) })
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    }

    const todayX = projX(todayMs)
    return {
      points,
      hauteur,
      mois,
      todayX,
      todayVisible: todayX >= 0 && todayX <= VIEW_W,
      filigrane: String(fenetre.centre.getFullYear()),
    }
  }, [contrats, fenetre.centre, fenetre.semaines.length])

  const naturesPresentes = useMemo(() => {
    const set = new Set(modele.points.map((p) => p.nature))
    return ORDRE_NATURES.filter((n) => set.has(n)).map((n) => ({
      label: NATURE_DEF[n].label,
      tone: NATURE_DEF[n].tone,
    }))
  }, [modele.points])

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
  const survolPoint = modele.points.find((p) => p.cle === survol) ?? null

  return (
    <DashboardCard icon={CalendarClock} title="Reconductions de contrats">
      <div ref={mesureRef} className="relative">
        {modele.points.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Aucune reconduction de contrat sur la période.
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${String(VIEW_W)} ${String(modele.hauteur)}`}
              role="img"
              aria-label="Frise des reconductions de contrats"
              className="block w-full"
            >
              {/* Année en filigrane. */}
              <text
                x={VIEW_W / 2}
                y={modele.hauteur * 0.62}
                textAnchor="middle"
                style={{
                  fill: 'var(--muted-foreground)',
                  opacity: 0.07,
                  fontSize: modele.hauteur * 0.7,
                  fontWeight: 700,
                }}
              >
                {modele.filigrane}
              </text>

              {/* Axe des mois : trait fin + libellé en haut. */}
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
                    x={m.x + 4}
                    y={AXE_H - 10}
                    textAnchor="start"
                    style={{ fill: 'var(--muted-foreground)', fontSize: 13 }}
                  >
                    {m.label}
                  </text>
                </g>
              ))}

              {/* « Aujourd'hui » : trait vertical pointillé. */}
              {modele.todayVisible && (
                <>
                  <line
                    x1={modele.todayX}
                    y1={AXE_H - 4}
                    x2={modele.todayX}
                    y2={modele.hauteur}
                    stroke="var(--muted-foreground)"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    opacity={0.7}
                  />
                  <text
                    x={modele.todayX + 4}
                    y={AXE_H + 10}
                    textAnchor="start"
                    style={{
                      fill: 'var(--muted-foreground)',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {"Aujourd'hui"}
                  </text>
                </>
              )}

              {/* Points. */}
              {modele.points.map((p) => {
                const def = NATURE_DEF[p.nature]
                const token = toneToken(def.tone)
                const cy = cyDe(p.lane)
                const diff = joursEntre(todayLocal(), p.date)
                const aria = `${p.prestataireLibelle} — ${def.label} · ${p.evenement} · ${formatDate(p.date)} · ${labelEcart(diff)}`
                return (
                  <g
                    key={p.cle}
                    role="button"
                    tabIndex={0}
                    aria-label={aria}
                    className="cursor-pointer outline-none"
                    onClick={() => ouvrir(p.prestataireId)}
                    onKeyDown={onKeyActivate(() => ouvrir(p.prestataireId))}
                    onMouseEnter={() => setSurvol(p.cle)}
                    onMouseLeave={() => setSurvol(null)}
                    onFocus={() => setSurvol(p.cle)}
                    onBlur={() => setSurvol(null)}
                  >
                    {def.halo && (
                      <>
                        <circle
                          cx={p.x}
                          cy={cy}
                          r={R * 1.9}
                          fill={token}
                          opacity={0.18}
                        />
                        <circle
                          cx={p.x}
                          cy={cy}
                          r={R * 1.4}
                          fill="none"
                          stroke={token}
                          strokeWidth={2}
                          opacity={0.5}
                        />
                      </>
                    )}
                    {def.losange ? (
                      <polygon
                        points={`${String(p.x)},${String(cy - R)} ${String(p.x + R)},${String(cy)} ${String(p.x)},${String(cy + R)} ${String(p.x - R)},${String(cy)}`}
                        fill={token}
                      >
                        <title>{aria}</title>
                      </polygon>
                    ) : (
                      <circle cx={p.x} cy={cy} r={R} fill={token}>
                        <title>{aria}</title>
                      </circle>
                    )}
                    {/* Zone de capture élargie pour un survol/clic confortable. */}
                    <circle cx={p.x} cy={cy} r={R + 6} fill="transparent" />
                  </g>
                )
              })}
            </svg>

            {survolPoint && (
              <div
                className="bg-popover text-popover-foreground pointer-events-none absolute z-10 rounded-md border px-2 py-1 text-xs shadow-md"
                style={{
                  left: `${String((survolPoint.x / VIEW_W) * 100)}%`,
                  top: `${String((cyDe(survolPoint.lane) / modele.hauteur) * 100)}%`,
                  transform: 'translate(-50%, calc(-100% - 8px))',
                }}
              >
                <div className="font-medium">
                  {survolPoint.prestataireLibelle}
                </div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {NATURE_DEF[survolPoint.nature].label} ·{' '}
                  {survolPoint.evenement}
                </div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {formatDate(survolPoint.date)} ·{' '}
                  {labelEcart(joursEntre(todayLocal(), survolPoint.date))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {naturesPresentes.length > 0 && <ChartLegend items={naturesPresentes} />}
    </DashboardCard>
  )
}
