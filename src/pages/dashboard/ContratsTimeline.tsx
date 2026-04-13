import { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { useContratsTimeline } from "@/hooks/use-dashboard";
import { formatDate } from "@/lib/utils/format";
import { MONTH_SHORT } from "../planning/helpers";
import type { ContratTimelineEvent } from "@/lib/types/dashboard";

const HORIZON_DAYS = 180;
const BASE_H = 55;
const AXIS_Y = 30;
const MARKER_R = 5;
const PAD_X = 40;

const TYPE_COLORS: Record<string, string> = {
  echeance:     "hsl(0, 65%, 50%)",
  fenetre:      "hsl(30, 75%, 52%)",
  reconduction: "hsl(50, 70%, 48%)",
  resiliation:  "hsl(265, 65%, 55%)",
};

function buildMonthTicks(today: Date, days: number): { label: string; frac: number }[] {
  const ticks: { label: string; frac: number }[] = [];
  const end = new Date(today);
  end.setDate(end.getDate() + days);
  const d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  while (d <= end) {
    const diff = (d.getTime() - today.getTime()) / (days * 86_400_000);
    ticks.push({ label: `${MONTH_SHORT[d.getMonth()]}`, frac: diff });
    d.setMonth(d.getMonth() + 1);
  }
  return ticks;
}

interface MarkerDef {
  evt: ContratTimelineEvent;
  frac: number;
  color: string;
  row: number;
}

function layoutMarkers(events: ContratTimelineEvent[]): MarkerDef[] {
  const markers: MarkerDef[] = [];
  const occupied: number[][] = []; // rows of occupied frac ranges

  for (const evt of events) {
    const frac = Math.max(0, Math.min(1, evt.jours_restants / HORIZON_DAYS));
    const color = TYPE_COLORS[evt.type_evenement] ?? TYPE_COLORS.reconduction!;

    // Trouver une rangée libre (éviter le chevauchement des labels)
    let row = 0;
    const minGap = 0.08;
    for (let r = 0; r < occupied.length; r++) {
      if (occupied[r]!.every((f) => Math.abs(f - frac) > minGap)) { row = r; break; }
      row = r + 1;
    }
    if (!occupied[row]) occupied[row] = [];
    occupied[row]!.push(frac);

    markers.push({ evt, frac, color, row });
  }
  return markers;
}

export function ContratsTimeline() {
  const { data: events = [] } = useContratsTimeline();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tooltip, setTooltip] = useState<{ evt: ContratTimelineEvent; cx: number; cy: number } | null>(null);

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
  const monthTicks = useMemo(() => buildMonthTicks(today, HORIZON_DAYS), [today]);

  const filtered = useMemo(
    () => events.filter((e) => e.jours_restants >= 0 && e.jours_restants <= HORIZON_DAYS),
    [events],
  );
  const markers = useMemo(() => layoutMarkers(filtered), [filtered]);
  const maxRow = markers.reduce((m, mk) => Math.max(m, mk.row), 0);
  const svgH = BASE_H + maxRow * 22;

  const mutedColor = useMemo(
    () => getComputedStyle(document.documentElement).getPropertyValue("--color-muted-foreground").trim(),
    [],
  );

  const xOf = (frac: number) => PAD_X + frac * (width - PAD_X * 2);

  return (
    <Card className="py-0 gap-0 shrink-0">
      <CardContent className="px-4 py-2">
        <p className="text-[11px] font-medium text-muted-foreground mb-1">Échéances contrats</p>
        <div ref={containerRef} className="relative">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 py-1">Aucune échéance</p>
          ) : (
            <svg width={width} height={svgH} className="w-full">
              {/* Axe horizontal */}
              <line x1={PAD_X} y1={AXIS_Y} x2={width - PAD_X} y2={AXIS_Y}
                stroke={mutedColor} strokeWidth={1} opacity={0.3} />

              {/* Marqueur "Aujourd'hui" */}
              <circle cx={xOf(0)} cy={AXIS_Y} r={3} fill={mutedColor} opacity={0.5} />
              <text x={xOf(0)} y={AXIS_Y + 14} textAnchor="middle" fontSize={8} fill={mutedColor} opacity={0.5}>Auj.</text>

              {/* Ticks mois */}
              {monthTicks.map((t) => (
                <g key={t.label}>
                  <line x1={xOf(t.frac)} y1={AXIS_Y - 4} x2={xOf(t.frac)} y2={AXIS_Y + 4}
                    stroke={mutedColor} strokeWidth={0.5} opacity={0.3} />
                  <text x={xOf(t.frac)} y={AXIS_Y + 14} textAnchor="middle" fontSize={8}
                    fill={mutedColor} opacity={0.5}>{t.label}</text>
                </g>
              ))}

              {/* Marqueurs événements */}
              {markers.map((mk, i) => {
                const x = xOf(mk.frac);
                const above = mk.row % 2 === 0;
                const labelY = above ? AXIS_Y - 14 - mk.row * 11 : AXIS_Y + 24 + mk.row * 11;

                return (
                  <g key={`${mk.evt.id_contrat}-${mk.evt.type_evenement}-${i}`}
                    className="cursor-pointer"
                    onClick={() => navigate(`/prestataires?contrat=${mk.evt.id_contrat}`)}
                    onMouseEnter={(e) => setTooltip({ evt: mk.evt, cx: e.clientX, cy: e.clientY })}
                    onMouseMove={(e) => setTooltip((t) => t ? { ...t, cx: e.clientX, cy: e.clientY } : null)}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    <line x1={x} y1={AXIS_Y} x2={x} y2={labelY + (above ? 6 : -6)}
                      stroke={mk.color} strokeWidth={0.5} opacity={0.4} className="pointer-events-none" />
                    {/* Zone de hit invisible plus large */}
                    <circle cx={x} cy={AXIS_Y} r={MARKER_R * 3} fill="transparent" />
                    <circle cx={x} cy={AXIS_Y} r={MARKER_R} fill={mk.color} className="pointer-events-none" />
                    <text x={x} y={labelY} textAnchor="middle" fontSize={8} fill={mk.color}
                      fontWeight={600} className="pointer-events-none">
                      {mk.evt.reference}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {tooltip && createPortal(
            <div className="fixed pointer-events-none bg-popover text-popover-foreground border rounded px-2 py-1.5 text-xs shadow-md whitespace-nowrap z-50"
              style={{ left: tooltip.cx + 16, top: tooltip.cy - 60 }}>
              <p className="font-semibold">{tooltip.evt.reference}</p>
              <p className="text-muted-foreground">{tooltip.evt.nom_prestataire}</p>
              <p>{tooltip.evt.description}</p>
              <p className="text-muted-foreground">{formatDate(tooltip.evt.date_evenement)} — {tooltip.evt.jours_restants}j</p>
            </div>,
            document.body,
          )}
        </div>
      </CardContent>
    </Card>
  );
}
