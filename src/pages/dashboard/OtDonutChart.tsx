import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OtList } from "@/components/shared/OtList";
import { HoverTooltip } from "@/components/shared/HoverTooltip";
import { useHoverTooltip } from "@/hooks/useHoverTooltip";
import { useDonutOt } from "@/hooks/use-dashboard";
import type { DonutSegment } from "./donut-segments";

// ── SVG constants ──

const SIZE = 500;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R_OUTER = 210;
const R_INNER = 140;
const GAP_DEG = 8;

// ── Types ──

interface DonutGroup {
  label: string;
  categorie: string;
  segments: DonutSegment[];
}

interface OtDonutChartProps {
  groups: DonutGroup[];
}

interface ArcDef {
  path: string;
  color: string;
  tooltip: string;
  categorie: string;
  groupLabel: string;
}

const DONE_STATUTS = new Set(["Clôturé", "Annulé"]);

const CATEGORIE_TITLES: Record<string, string> = {
  en_retard: "OT en retard",
  cette_semaine: "OT cette semaine",
  en_cours: "OT en cours",
};

// ── SVG helpers ──

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(startDeg: number, endDeg: number): string {
  const span = endDeg - startDeg;
  const largeArc = span > 180 ? 1 : 0;
  const s1 = polarToXY(CX, CY, R_OUTER, startDeg);
  const s2 = polarToXY(CX, CY, R_OUTER, endDeg);
  const s3 = polarToXY(CX, CY, R_INNER, endDeg);
  const s4 = polarToXY(CX, CY, R_INNER, startDeg);
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${largeArc} 1 ${s2.x} ${s2.y}`,
    `L ${s3.x} ${s3.y}`,
    `A ${R_INNER} ${R_INNER} 0 ${largeArc} 0 ${s4.x} ${s4.y}`,
    "Z",
  ].join(" ");
}

/// Modale affichant les OT d'une catégorie du donut
function DonutModal({ categorie, onClose }: { categorie: string; onClose: () => void }) {
  const { data = [] } = useDonutOt(categorie);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle>{CATEGORIE_TITLES[categorie] ?? "Ordres de travail"}</DialogTitle>
          <DialogDescription>{data.length} ordre(s) de travail</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-3 pb-3">
          <OtList data={data} showTitle={false} showSearch={false} showDateRange={false} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/// Graphique en anneau SVG avec gaps entre groupes, sous-segments collés
export function OtDonutChart({ groups }: OtDonutChartProps) {
  const { tooltip, show, move, hide } = useHoverTooltip<string>();
  const [openCategorie, setOpenCategorie] = useState<string | null>(null);

  const nonEmpty = useMemo(() => groups.filter((g) => g.segments.some((s) => s.value > 0)), [groups]);
  const total = useMemo(() => nonEmpty.reduce((s, g) => s + g.segments.reduce((ss, seg) => ss + seg.value, 0), 0), [nonEmpty]);
  const todo = useMemo(() => nonEmpty.reduce((s, g) => s + g.segments.reduce((ss, seg) => ss + (DONE_STATUTS.has(seg.label) ? 0 : seg.value), 0), 0), [nonEmpty]);

  const arcs = useMemo<ArcDef[]>(() => {
    if (total === 0 || nonEmpty.length === 0) return [];
    const totalGap = nonEmpty.length * GAP_DEG;
    const available = 360 - totalGap;
    let angle = 0;
    const result: ArcDef[] = [];

    for (const group of nonEmpty) {
      const groupTotal = group.segments.reduce((s, seg) => s + seg.value, 0);
      const groupSpan = (groupTotal / total) * available;

      for (const seg of group.segments) {
        if (seg.value <= 0) continue;
        const segSpan = (seg.value / groupTotal) * groupSpan;
        if (segSpan < 0.1) continue;
        result.push({
          path: arcPath(angle, angle + segSpan),
          color: seg.color,
          tooltip: `${seg.label} : ${seg.value}`,
          categorie: group.categorie,
          groupLabel: group.label,
        });
        angle += segSpan;
      }
      angle += GAP_DEG;
    }
    return result;
  }, [nonEmpty, total]);

  if (total === 0) return null;

  return (
    <>
      <Card className="py-0 gap-0 grow-0 shrink-0 basis-1/5 min-w-36 flex flex-col">
        <CardContent className="p-1 flex flex-col flex-1 min-h-0">
          <p className="text-[11px] font-medium text-muted-foreground text-center pt-1">Ordres de travail</p>
          <div className="flex-1 min-h-0 relative">
            <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
              {arcs.map((arc, i) => (
                <path
                  key={i}
                  d={arc.path}
                  fill={arc.color}
                  className="transition-opacity hover:opacity-80 cursor-pointer"
                  onClick={() => setOpenCategorie(arc.categorie)}
                  onMouseEnter={show(arc.tooltip)}
                  onMouseMove={move}
                  onMouseLeave={hide}
                />
              ))}
              <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
                className="fill-foreground text-[48px] font-semibold">{todo}</text>
            </svg>
            {tooltip && (
              <HoverTooltip cx={tooltip.cx} cy={tooltip.cy} className="whitespace-nowrap">
                {tooltip.data}
              </HoverTooltip>
            )}
          </div>
        </CardContent>
      </Card>
      {openCategorie && <DonutModal categorie={openCategorie} onClose={() => setOpenCategorie(null)} />}
    </>
  );
}
