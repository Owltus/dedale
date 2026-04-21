import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useContratsTimeline } from "@/hooks/use-dashboard";
import { formatDate } from "@/lib/utils/format";
import { MONTH_SHORT } from "../planning/helpers";
import type { ContratTimelineEvent } from "@/lib/types/dashboard";

// ─── Horizon adaptatif ──────────────────────────────────────────────────
// Largeur cible par mois en pixels : plus la fenêtre est large, plus on affiche de mois.
// Même esprit que PlanningChart.tsx qui utilise BAR_WIDTH pour piloter le nombre de semaines.
const MONTH_WIDTH_TARGET = 70;
const MIN_MONTHS = 6;
const MAX_MONTHS = 36; // le backend renvoie ±10 ans, frontend plafonne à 36 mois
// Ratio passé/total (aujourd'hui reste à 1/3 du graphe quelle que soit la largeur).
const PAST_RATIO = 1 / 3;
// Approximation pour dimensionner l'affichage uniquement ; les vraies dates
// viennent du backend qui utilise chrono (calendrier exact).
const DAYS_PER_MONTH = 30.44;

interface Horizon {
  pastDays: number;
  futureDays: number;
  spanDays: number;
  offsetDays: number;   // décalage du viewport par rapport à aujourd'hui
  todayFrac: number;    // position du vrai "aujourd'hui" dans le viewport ([0,1] ou hors bornes)
}

function computeHorizon(width: number, offsetDays: number): Horizon {
  const trackWidth = Math.max(100, width - 64);
  const monthCount = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, Math.floor(trackWidth / MONTH_WIDTH_TARGET)));
  const pastMonths = Math.max(1, Math.round(monthCount * PAST_RATIO));
  const futureMonths = Math.max(1, monthCount - pastMonths);
  const pastDays = Math.round(pastMonths * DAYS_PER_MONTH);
  const futureDays = Math.round(futureMonths * DAYS_PER_MONTH);
  const spanDays = pastDays + futureDays;
  // Le vrai "aujourd'hui" est à jours_restants = 0 ; on convertit en frac.
  const todayFrac = (pastDays - offsetDays) / spanDays;
  return { pastDays, futureDays, spanDays, offsetDays, todayFrac };
}

// ─── Couleurs par état ──────────────────────────────────────────────────
const COLOR_PASSE   = "hsl(215, 15%, 55%)";  // gris — reconduction passée
const COLOR_FUTUR   = "hsl(215, 70%, 52%)";  // bleu — reconduction à venir (> 30j)
const COLOR_URGENT  = "hsl(0, 65%, 50%)";    // rouge — reconduction à ≤30j
const COLOR_FENETRE = "hsl(30, 85%, 55%)";   // orange — fenêtre de résiliation ouverte
const COLOR_RESIL   = "hsl(265, 65%, 55%)";  // violet — résiliation notifiée
const COLOR_DEBUT   = "hsl(150, 55%, 42%)";  // vert — création de contrat

// ─── Dimensions ─────────────────────────────────────────────────────────
const PAD_X = 32;
const AXIS_Y = 58;
const LANE_GAP = 14;
const MAX_STACK = 3;
const MONTH_LABEL_Y = AXIS_Y + 14;
const SVG_H = AXIS_Y + 24;

// Types retenus pour l'affichage (les autres servent uniquement au calcul)
const DEADLINE_TYPES = new Set(["reconduction", "echeance", "resiliation", "debut"]);

function toFrac(jours: number, h: Horizon): number {
  // jours = jours_restants vs aujourd'hui. Le viewport couvre
  // [offsetDays - pastDays, offsetDays + futureDays] → frac ∈ [0, 1]
  return Math.max(0, Math.min(1, (jours - h.offsetDays + h.pastDays) / h.spanDays));
}

/**
 * Calcule les bandes année visibles dans le viewport courant, pour afficher
 * l'année en filigrane au centre de chaque tronçon. Suit automatiquement le
 * décalage temporel (flèches clavier).
 */
function buildYearBands(today: Date, h: Horizon): { year: number; fracMid: number }[] {
  const viewStartDays = h.offsetDays - h.pastDays;
  const viewEndDays = h.offsetDays + h.futureDays;
  const viewStart = new Date(today); viewStart.setDate(viewStart.getDate() + viewStartDays);
  const viewEnd = new Date(today); viewEnd.setDate(viewEnd.getDate() + viewEndDays);

  const bands: { year: number; fracMid: number }[] = [];
  let cursor = new Date(viewStart);
  while (cursor <= viewEnd) {
    const year = cursor.getFullYear();
    const nextYear = new Date(year + 1, 0, 1);
    const bandEnd = nextYear <= viewEnd ? nextYear : viewEnd;

    const joursStart = (cursor.getTime() - today.getTime()) / 86_400_000;
    const joursEnd = (bandEnd.getTime() - today.getTime()) / 86_400_000;
    const fracMid = toFrac((joursStart + joursEnd) / 2, h);
    bands.push({ year, fracMid });

    cursor = new Date(year + 1, 0, 1);
  }
  return bands;
}

function buildMonthTicks(today: Date, h: Horizon): { label: string; frac: number; isYear: boolean }[] {
  const ticks: { label: string; frac: number; isYear: boolean }[] = [];
  const start = new Date(today); start.setDate(start.getDate() + h.offsetDays - h.pastDays);
  const end = new Date(today); end.setDate(end.getDate() + h.offsetDays + h.futureDays);
  const d = new Date(start.getFullYear(), start.getMonth(), 1);
  if (d < start) d.setMonth(d.getMonth() + 1);
  while (d <= end) {
    const joursDepuisAuj = (d.getTime() - today.getTime()) / 86_400_000;
    ticks.push({
      label: MONTH_SHORT[d.getMonth()]!,
      frac: toFrac(joursDepuisAuj, h),
      isYear: d.getMonth() === 0,
    });
    d.setMonth(d.getMonth() + 1);
  }
  return ticks;
}

interface Marker {
  evt: ContratTimelineEvent;
  frac: number;
  color: string;
  shape: "dot" | "diamond";
  inFenetre: boolean;
  lane: number;
}

/**
 * Ne garde que les deadlines (reconduction/échéance/résiliation), les colore
 * selon l'urgence, et signale "fenêtre ouverte" (= aujourd'hui dans la période
 * de résiliation) avec un halo orange autour du point.
 */
/**
 * Couples (id_contrat, jours_restants de la reconduction associée) dont la fenêtre
 * est ouverte aujourd'hui. La reconduction associée à une fenêtre tombe exactement à
 * fenetre.jours_restants + fenetre.duree_jours + 1 (voir backend).
 */
function computeFenetresOuvertes(allEvents: ContratTimelineEvent[]): Set<string> {
  const set = new Set<string>();
  for (const e of allEvents) {
    if (e.type_evenement !== "fenetre" || e.duree_jours == null) continue;
    const start = e.jours_restants;
    const end = e.jours_restants + e.duree_jours;
    if (0 >= start && 0 <= end) set.add(`${e.id_contrat}:${end + 1}`);
  }
  return set;
}

function buildMarkers(allEvents: ContratTimelineEvent[], h: Horizon, fenetresOuvertes: Set<string>): Marker[] {
  const isInFenetre = (evt: ContratTimelineEvent): boolean => {
    // Tolérance ±1 jour pour absorber un éventuel off-by-one côté backend
    for (let delta = -1; delta <= 1; delta++) {
      if (fenetresOuvertes.has(`${evt.id_contrat}:${evt.jours_restants + delta}`)) return true;
    }
    return false;
  };

  // Les deadlines affichées sont filtrées par le viewport (tient compte du offset)
  const minJours = h.offsetDays - h.pastDays;
  const maxJours = h.offsetDays + h.futureDays;
  const sorted = allEvents
    .filter((e) => DEADLINE_TYPES.has(e.type_evenement))
    .filter((e) => e.jours_restants >= minJours && e.jours_restants <= maxJours)
    .sort((a, b) => a.jours_restants - b.jours_restants);

  const stacks: number[][] = [];
  const markers: Marker[] = [];

  for (const evt of sorted) {
    const frac = toFrac(evt.jours_restants, h);
    const inFenetre = evt.type_evenement === "reconduction" && isInFenetre(evt);

    let color: string;
    let shape: "dot" | "diamond" = "dot";
    if (evt.type_evenement === "resiliation") {
      color = COLOR_RESIL;
      shape = "diamond";
    } else if (evt.type_evenement === "debut") {
      color = COLOR_DEBUT;
    } else if (inFenetre) {
      color = COLOR_FENETRE;
    } else if (evt.jours_restants < 0) {
      color = COLOR_PASSE;
    } else if (evt.jours_restants <= 30) {
      color = COLOR_URGENT;
    } else {
      color = COLOR_FUTUR;
    }

    // Empilement en cas de chevauchement horizontal serré
    const minGap = 0.025;
    let lane = 0;
    for (; lane < MAX_STACK; lane++) {
      const col = stacks[lane];
      const last = col && col.length > 0 ? col[col.length - 1]! : undefined;
      if (last === undefined || frac > last + minGap) break;
    }
    if (!stacks[lane]) stacks[lane] = [];
    stacks[lane]!.push(frac);

    markers.push({ evt, frac, color, shape, inFenetre, lane });
  }
  return markers;
}

interface ContratsTimelineProps {
  /// Décalage du viewport en jours par rapport à aujourd'hui (piloté au clavier depuis le Dashboard)
  offsetDays?: number;
}

export function ContratsTimeline({ offsetDays = 0 }: ContratsTimelineProps = {}) {
  const { data: events = [] } = useContratsTimeline();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{ evt: ContratTimelineEvent; inFenetre: boolean; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth((prev) => {
      const w = el.clientWidth;
      return Math.abs(prev - w) < 2 ? prev : w;
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const today = useMemo(() => new Date(), []);
  const horizon = useMemo(() => computeHorizon(width, offsetDays), [width, offsetDays]);
  const monthTicks = useMemo(() => buildMonthTicks(today, horizon), [today, horizon]);
  const yearBands = useMemo(() => buildYearBands(today, horizon), [today, horizon]);

  const fenetresOuvertes = useMemo(() => computeFenetresOuvertes(events), [events]);
  const markers = useMemo(() => buildMarkers(events, horizon, fenetresOuvertes), [events, horizon, fenetresOuvertes]);

  const xOf = (frac: number) => PAD_X + frac * (width - PAD_X * 2);

  return (
    <Card className="py-0 gap-0 shrink-0">
      <CardContent className="px-4 py-2">
        <p className="text-[11px] font-medium text-muted-foreground mb-1">Reconductions contrats</p>

        <div ref={containerRef} className="relative">
          {markers.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 py-1">Aucune reconduction dans la période</p>
          ) : (
            <svg width={width} height={SVG_H} className="w-full">
              {/* Année en filigrane dans la zone des points (se déplace avec la navigation) */}
              {yearBands.map((b) => (
                <text key={`y-${b.year}`} x={xOf(b.fracMid)} y={AXIS_Y / 2}
                  textAnchor="middle" dominantBaseline="middle" fontSize={36} fontWeight={700}
                  className="fill-muted-foreground/10 select-none pointer-events-none">
                  {b.year}
                </text>
              ))}

              {/* Grille mois légère */}
              {monthTicks.map((t, i) => (
                <line key={`grid-${i}`} x1={xOf(t.frac)} y1={4} x2={xOf(t.frac)} y2={AXIS_Y}
                  stroke={t.isYear ? "white" : "currentColor"}
                  className={t.isYear ? undefined : "text-muted-foreground/10"}
                  opacity={t.isYear ? 0.5 : undefined}
                  strokeWidth={t.isYear ? 1.5 : 1} />
              ))}

              {/* Axe */}
              <line x1={PAD_X} y1={AXIS_Y} x2={width - PAD_X} y2={AXIS_Y}
                stroke="currentColor" className="text-muted-foreground/40" strokeWidth={1} />

              {/* Labels mois */}
              {monthTicks.map((t, i) => {
                const x = xOf(t.frac);
                return (
                  <g key={`m-${i}`}>
                    <line x1={x} y1={AXIS_Y} x2={x} y2={AXIS_Y + 3}
                      stroke="currentColor" className="text-muted-foreground/30" strokeWidth={1} />
                    <text x={x} y={MONTH_LABEL_Y} textAnchor="middle" fontSize={9}
                      className="fill-muted-foreground" fontWeight={t.isYear ? 600 : 400}>{t.label}</text>
                  </g>
                );
              })}

              {/* Aujourd'hui : ligne pointillée seule, masquée si on a navigué hors du viewport */}
              {horizon.todayFrac >= 0 && horizon.todayFrac <= 1 && (
                <line x1={xOf(horizon.todayFrac)} y1={4} x2={xOf(horizon.todayFrac)} y2={SVG_H - 2}
                  stroke="currentColor" className="text-foreground/50" strokeWidth={1} strokeDasharray="3 2" />
              )}

              {/* Marqueurs : un point par reconduction/échéance, losange pour résiliation */}
              {markers.map((mk, i) => {
                const x = xOf(mk.frac);
                const y = AXIS_Y - LANE_GAP - mk.lane * LANE_GAP;
                return (
                  <g key={i}
                    className="cursor-pointer"
                    onClick={() => navigate(`/prestataires?contrat=${mk.evt.id_contrat}`)}
                    onMouseEnter={(e) => setTooltip({ evt: mk.evt, inFenetre: mk.inFenetre, cx: e.clientX, cy: e.clientY })}
                    onMouseMove={(e) => setTooltip((t) => t ? { ...t, cx: e.clientX, cy: e.clientY } : null)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {/* Tige vers l'axe */}
                    <line x1={x} y1={y + 4} x2={x} y2={AXIS_Y - 1}
                      stroke={mk.color} strokeWidth={1} opacity={mk.inFenetre ? 0.6 : 0.3} />
                    {/* Hit zone */}
                    <circle cx={x} cy={y} r={10} fill="transparent" />
                    {/* Halo si fenêtre ouverte */}
                    {mk.inFenetre && (
                      <circle cx={x} cy={y} r={8} fill={mk.color} fillOpacity={0.25} />
                    )}
                    {/* Marqueur */}
                    {mk.shape === "diamond" ? (
                      <path d={`M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y} Z`}
                        fill={mk.color} stroke="var(--background)" strokeWidth={1} />
                    ) : (
                      <circle cx={x} cy={y} r={4.5} fill={mk.color}
                        stroke="var(--background)" strokeWidth={1} />
                    )}
                  </g>
                );
              })}
            </svg>
          )}

          {tooltip && createPortal(
            <div className="fixed pointer-events-none bg-popover text-popover-foreground border rounded px-2 py-1.5 text-xs shadow-md whitespace-nowrap z-50"
              style={{ left: tooltip.cx + 16, top: tooltip.cy - 60 }}>
              <p className="font-semibold">{tooltip.evt.nom_prestataire}</p>
              {tooltip.inFenetre && (
                <p className="font-medium" style={{ color: COLOR_FENETRE }}>Fenêtre de résiliation ouverte</p>
              )}
              <p>{tooltip.evt.description}</p>
              <p className="text-muted-foreground">
                {formatDate(tooltip.evt.date_evenement)} — {tooltip.evt.jours_restants >= 0 ? `dans ${tooltip.evt.jours_restants}j` : `il y a ${-tooltip.evt.jours_restants}j`}
              </p>
            </div>,
            document.body,
          )}
        </div>
      </CardContent>
    </Card>
  );
}
