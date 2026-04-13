import { useMemo, useRef, useState, useEffect } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from "chart.js";
import { Card, CardContent } from "@/components/ui/card";
import { usePlanningAnnee } from "@/hooks/use-dashboard";
import {
  getISOWeekDate, getMondayOfISOWeek, dateToWeekInfo, getEffectiveDate,
  getOtPriority, computeGlissantWeeks,
} from "../planning/helpers";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// ── Couleurs par priorité (alignées sur le donut OT et la page planning) ──

const PRIORITIES = [7, 6, 5, 4, 3, 2, 1] as const;

const P_COLOR: Record<number, string> = {
  1: "hsl(0, 65%, 50%)",   // En retard
  2: "hsl(30, 75%, 52%)",  // Réouvert
  3: "hsl(215, 70%, 52%)", // En cours
  4: "hsl(150, 65%, 42%)", // Clôturé
  5: "hsl(50, 70%, 48%)",  // Annulé
  6: "hsl(265, 65%, 55%)", // Planifié
  7: "hsl(215, 20%, 55%)", // Programmé
};

const P_LABEL: Record<number, string> = {
  1: "En retard", 2: "Réouvert", 3: "En cours",
  4: "Clôturé", 5: "Annulé", 6: "Planifié", 7: "Programmé",
};

const BAR_WIDTH = 28; // largeur cible d'une colonne (px)
const MIN_WEEKS = 8;
const MAX_WEEKS = 52;

function resolveColor(cssVar: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
}

function buildOptions(currentIdx: number) {
  const primary = resolveColor("--color-primary");
  const muted = resolveColor("--color-muted-foreground");

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: "index" as const, intersect: false },
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
}

/// Graphique en barres empilées : OT par semaine ISO, adapté à la largeur
export function PlanningChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [weekCount, setWeekCount] = useState(13);

  const { isoWeek: currentWeek, isoYear: currentISOYear } = useMemo(() => getISOWeekDate(new Date()), []);
  const weekStartStr = useMemo(() => getMondayOfISOWeek(currentISOYear, currentWeek).toISOString().split("T")[0]!, [currentISOYear, currentWeek]);

  // Mesure du conteneur → nombre de semaines
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

  const displayWeeks = useMemo(() => computeGlissantWeeks(currentISOYear, currentWeek, 0, weekCount), [currentISOYear, currentWeek, weekCount]);

  const years = useMemo(() => [...new Set(displayWeeks.map((w) => w.year))].sort(), [displayWeeks]);
  const { data: eventsA = [] } = usePlanningAnnee(years[0] ?? currentISOYear);
  const { data: eventsB = [] } = usePlanningAnnee(years[1] ?? years[0] ?? currentISOYear);

  const events = useMemo(() => {
    if (years.length <= 1) return eventsA;
    const seen = new Set<number>();
    const result = [];
    for (const list of [eventsA, eventsB]) {
      for (const e of list) {
        if (!seen.has(e.id_ordre_travail)) { seen.add(e.id_ordre_travail); result.push(e); }
      }
    }
    return result;
  }, [eventsA, eventsB, years]);

  const chartData = useMemo(() => {
    const weekKeys = new Set(displayWeeks.map((w) => w.key));
    const counts = new Map<string, Record<number, number>>();
    for (const w of displayWeeks) counts.set(w.key, {});

    for (const ot of events) {
      const wi = dateToWeekInfo(getEffectiveDate(ot));
      if (!weekKeys.has(wi.key)) continue;
      const p = getOtPriority(ot, weekStartStr);
      const bucket = counts.get(wi.key)!;
      bucket[p] = (bucket[p] ?? 0) + 1;
    }

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

  const options = useMemo(() => buildOptions(
    displayWeeks.findIndex((w) => w.week === currentWeek && w.year === currentISOYear),
  ), [displayWeeks, currentWeek, currentISOYear]);

  return (
    <Card className="py-0 gap-0 flex-1 flex flex-col">
      <CardContent className="flex flex-col flex-1 p-2 min-h-0">
        <p className="text-[11px] font-medium text-muted-foreground text-center">Planning OT</p>
        <div ref={containerRef} className="flex-1 min-h-0">
          <Bar data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}
