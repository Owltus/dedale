import { useMemo, useRef, useState, useEffect } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
  type ActiveElement, type ChartEvent, type Plugin,
} from "chart.js";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OtList } from "@/components/shared/OtList";
import { usePlanningAnnee } from "@/hooks/use-dashboard";
import { useOtByIds } from "@/hooks/use-ordres-travail";
import {
  getISOWeekDate, getMondayOfISOWeek, dateToWeekInfo, getEffectiveDate,
  getOtPriority, computeGlissantWeeks,
} from "../planning/helpers";
import type { PlanningEvent } from "@/lib/types/dashboard";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const PRIORITIES = [7, 6, 5, 4, 3, 2, 1] as const;

const P_COLOR: Record<number, string> = {
  1: "hsl(0, 65%, 50%)",   2: "hsl(30, 75%, 52%)",  3: "hsl(215, 70%, 52%)",
  4: "hsl(150, 65%, 42%)",  5: "hsl(50, 70%, 48%)",  6: "hsl(265, 65%, 55%)",
  7: "hsl(215, 20%, 55%)",
};

const P_LABEL: Record<number, string> = {
  1: "En retard", 2: "Réouvert", 3: "En cours",
  4: "Clôturé", 5: "Annulé", 6: "Planifié", 7: "Programmé",
};

const BAR_WIDTH = 28;
const MIN_WEEKS = 1;
const MAX_WEEKS = 52;

function resolveColor(cssVar: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

interface PlanningChartProps {
  /// Décalage en semaines par rapport à la semaine courante (piloté au clavier depuis le Dashboard)
  weekOffset?: number;
}

export function PlanningChart({ weekOffset = 0 }: PlanningChartProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const weekOtIdsRef = useRef<Map<string, number[]>>(new Map());
  const [weekCount, setWeekCount] = useState(13);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const { isoWeek: currentWeek, isoYear: currentISOYear } = useMemo(() => getISOWeekDate(new Date()), []);
  const weekStartStr = useMemo(() => getMondayOfISOWeek(currentISOYear, currentWeek).toISOString().split("T")[0]!, [currentISOYear, currentWeek]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const count = Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.floor(w / BAR_WIDTH)));
      setWeekCount((prev) => prev === count ? prev : count);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const displayWeeks = useMemo(() => computeGlissantWeeks(currentISOYear, currentWeek, weekOffset, weekCount), [currentISOYear, currentWeek, weekOffset, weekCount]);

  const years = useMemo(() => [...new Set(displayWeeks.map((w) => w.year))].sort(), [displayWeeks]);
  const { data: eventsA = [] } = usePlanningAnnee(years[0] ?? currentISOYear);
  const { data: eventsB = [] } = usePlanningAnnee(years[1] ?? years[0] ?? currentISOYear);

  const events = useMemo(() => {
    if (years.length <= 1) return eventsA;
    const seen = new Set<number>();
    const result: PlanningEvent[] = [];
    for (const list of [eventsA, eventsB]) {
      for (const e of list) {
        if (!seen.has(e.id_ordre_travail)) { seen.add(e.id_ordre_travail); result.push(e); }
      }
    }
    return result;
  }, [eventsA, eventsB, years]);

  // Bandes année visibles : même filigrane que sur ContratsTimeline, suit le weekOffset
  const yearBands = useMemo(() => {
    if (displayWeeks.length === 0) return [];
    const bands: { year: number; startIdx: number; endIdx: number }[] = [];
    let start = 0;
    let currentYear = displayWeeks[0]!.year;
    for (let i = 1; i <= displayWeeks.length; i++) {
      const y = displayWeeks[i]?.year;
      if (y !== currentYear) {
        bands.push({ year: currentYear, startIdx: start, endIdx: i - 1 });
        if (y === undefined) break;
        start = i;
        currentYear = y;
      }
    }
    return bands;
  }, [displayWeeks]);

  // Agrégation unique : chart data + index OT par semaine
  const chartData = useMemo(() => {
    const weekKeys = new Set(displayWeeks.map((w) => w.key));
    const counts = new Map<string, Record<number, number>>();
    const ids = new Map<string, number[]>();
    for (const w of displayWeeks) { counts.set(w.key, {}); ids.set(w.key, []); }

    for (const ot of events) {
      const wi = dateToWeekInfo(getEffectiveDate(ot));
      if (!weekKeys.has(wi.key)) continue;
      const p = getOtPriority(ot, weekStartStr);
      const bucket = counts.get(wi.key)!;
      bucket[p] = (bucket[p] ?? 0) + 1;
      ids.get(wi.key)!.push(ot.id_ordre_travail);
    }

    weekOtIdsRef.current = ids;

    return {
      labels: displayWeeks.map((w) => `S${w.week}`),
      datasets: PRIORITIES.map((p) => ({
        label: P_LABEL[p]!,
        data: displayWeeks.map((w) => counts.get(w.key)?.[p] ?? 0),
        backgroundColor: P_COLOR[p]!,
        borderRadius: 2,
      })),
    };
  }, [events, displayWeeks, weekStartStr]);

  // Options stables (ne dépend pas de weekOtIds grâce au ref)
  const options = useMemo(() => {
    const primary = resolveColor("--color-primary");
    const muted = resolveColor("--color-muted-foreground");
    const currentIdx = displayWeeks.findIndex((w) => w.week === currentWeek && w.year === currentISOYear);

    return {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
        if (elements.length === 0) return;
        const w = displayWeeks[elements[0]!.index];
        if (!w) return;
        const ids = weekOtIdsRef.current.get(w.key) ?? [];
        if (ids.length > 0) setSelectedIds(ids);
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index" as const,
          intersect: false,
          filter: (item: { raw: unknown }) => (item.raw as number) > 0,
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          ticks: {
            font: (ctx: { index: number }) => ({
              size: 9,
              weight: ctx.index === currentIdx ? "bold" as const : "normal" as const,
            }),
            color: (ctx: { index: number }) => ctx.index === currentIdx ? primary : muted,
          },
        },
        y: { stacked: true, beginAtZero: true, display: false, grace: "20%" },
      },
    };
  }, [displayWeeks, currentWeek, currentISOYear]);

  // Ref mise à jour à chaque changement : permet au plugin (stable) de lire
  // les bandes année les plus récentes sans être recréé à chaque render.
  const yearBandsRef = useRef(yearBands);
  useEffect(() => { yearBandsRef.current = yearBands; }, [yearBands]);

  // Plugin filigrane année : stable, lit les données courantes via la ref.
  const yearWatermarkPlugin = useMemo<Plugin<"bar">>(() => ({
    id: "year-watermark",
    beforeDatasetsDraw(chart) {
      const xScale = chart.scales.x;
      const bands = yearBandsRef.current;
      if (!xScale || bands.length === 0) return;
      const { ctx, chartArea } = chart;
      const centerY = (chartArea.top + chartArea.bottom) / 2;
      const height = chartArea.bottom - chartArea.top;
      const fontSize = Math.max(18, Math.min(48, Math.round(height * 0.55)));
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.fillStyle = "rgba(100, 116, 139, 0.12)";
      for (const band of bands) {
        const xStart = xScale.getPixelForValue(band.startIdx);
        const xEnd = xScale.getPixelForValue(band.endIdx);
        ctx.fillText(String(band.year), (xStart + xEnd) / 2, centerY);
      }
      ctx.restore();
    },
  }), []);

  const { data: modalOts = [] } = useOtByIds(selectedIds);

  // Label dérivé (pas de state séparé)
  const selectedLabel = useMemo(() => {
    if (selectedIds.length === 0) return "";
    for (const w of displayWeeks) {
      if (weekOtIdsRef.current.get(w.key)?.includes(selectedIds[0]!)) {
        return `Semaine ${w.week} (${selectedIds.length} OT)`;
      }
    }
    return `${selectedIds.length} OT`;
  }, [selectedIds, displayWeeks]);

  return (
    <>
      <Card className="py-0 gap-0 flex-1 flex flex-col">
        <CardContent className="flex flex-col flex-1 p-2 min-h-0">
          <p className="text-[11px] font-medium text-muted-foreground text-center">Planning ordres de travail</p>
          <div ref={containerRef} className="flex-1 min-h-0">
            <Bar data={chartData} options={options} plugins={[yearWatermarkPlugin]} />
          </div>
        </CardContent>
      </Card>
      <Dialog open={selectedIds.length > 0} onOpenChange={(open) => { if (!open) setSelectedIds([]); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>{selectedLabel}</DialogTitle>
            <DialogDescription>Cliquez sur un OT pour voir son détail</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden px-3 pb-3">
            <OtList data={modalOts} showTitle={false} showSearch={false} showDateRange={false} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
