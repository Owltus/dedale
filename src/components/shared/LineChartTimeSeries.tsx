import { useEffect, useMemo, useRef } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ActiveElement,
  type ChartEvent,
  type TooltipItem,
} from "chart.js";
import { formatDateShort } from "@/lib/utils/format";
import { findContainingJalon } from "@/lib/utils/cadence";
import type { RelevePoint } from "@/lib/types/releves";
import { computeYearBands, makeYearWatermarkPlugin, type YearBand } from "./chartPlugins";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
);

export interface ChartSeries {
  label: string;
  points: RelevePoint[];
  seuilMin: number | null;
  seuilMax: number | null;
}

interface LineChartTimeSeriesProps {
  series: ChartSeries[];
  unite: string | null;
  onPointClick: (idOt: number) => void;
  /** Hauteur fixe en pixels. Si omis, le composant occupe 100 % de la hauteur du parent —
   *  utile pour les layouts flex où le graphe doit s'étirer (ex: 1 ou 2 graphes par page). */
  height?: number;
  /** Formatage des labels de l'axe X. Par défaut : `formatDateShort`. */
  formatLabel?: (iso: string) => string;
  /** Dates ISO supplémentaires à inclure dans l'axe X (sans données associées) — utile pour
   *  garder un axe temporel complet sur la fenêtre visible même sans relevés. */
  extraDates?: string[];
}

const COLOR_CONFORME = "rgb(16, 185, 129)";
const COLOR_NON_CONFORME = "rgb(239, 68, 68)";
const COLOR_NEUTRE = "rgb(100, 116, 139)";
const COLOR_LINE_NEUTRE = "rgba(100, 116, 139, 0.6)";
const COLOR_SEUIL = "rgba(239, 68, 68, 0.5)";

// Palette pour le multi-séries — assez contrastée pour distinguer 6+ lignes
const PALETTE = [
  "rgb(59, 130, 246)",   // blue-500
  "rgb(168, 85, 247)",   // purple-500
  "rgb(236, 72, 153)",   // pink-500
  "rgb(245, 158, 11)",   // amber-500
  "rgb(20, 184, 166)",   // teal-500
  "rgb(132, 204, 22)",   // lime-500
  "rgb(251, 113, 133)",  // rose-400
  "rgb(99, 102, 241)",   // indigo-500
];

function pointColor(estConforme: number | null): string {
  if (estConforme === 1) return COLOR_CONFORME;
  if (estConforme === 0) return COLOR_NON_CONFORME;
  return COLOR_NEUTRE;
}

/// Convertit une couleur `rgb(r, g, b)` en `rgba(r, g, b, alpha)`.
function withOpacity(rgb: string, alpha: number): string {
  return rgb.replace(/^rgb\(/, "rgba(").replace(/\)$/, `, ${alpha})`);
}

/**
 * Construit l'axe X et les data des séries.
 *
 * - Si `extraDates` (jalons) est fourni : l'axe X = jalons UNIQUEMENT, et chaque relevé
 *   est snappé sur le jalon le plus proche (cohérence inter-graphes sur la même page).
 * - Sinon : l'axe X = union des dates des relevés (mode legacy).
 */
function buildMultiSeriesData(series: ChartSeries[], formatLabel: (iso: string) => string, extraDates: string[]) {
  if (extraDates.length > 0) {
    const sortedDates = [...extraDates].sort();
    const jalonsTimes = sortedDates.map((d) => new Date(d).getTime());
    const labels = sortedDates.map(formatLabel);

    const pointsByLabel = new Map<string, (RelevePoint | null)[]>();
    for (const s of series) {
      const byJalon = new Map<string, RelevePoint>();
      for (const p of s.points) {
        const jalon = findContainingJalon(p.date_releve, jalonsTimes, sortedDates);
        if (!jalon) continue;
        // Si plusieurs relevés tombent sur le même jalon, on garde le plus récent.
        const existing = byJalon.get(jalon);
        if (!existing || p.date_releve > existing.date_releve) {
          byJalon.set(jalon, p);
        }
      }
      pointsByLabel.set(s.label, sortedDates.map((d) => byJalon.get(d) ?? null));
    }
    return { labels, sortedDates, pointsByLabel };
  }

  // Legacy : union des dates des relevés
  const allDates = new Set<string>();
  for (const s of series) {
    for (const p of s.points) allDates.add(p.date_releve);
  }
  const sortedDates = Array.from(allDates).sort();
  const labels = sortedDates.map(formatLabel);

  const pointsByLabel = new Map<string, (RelevePoint | null)[]>();
  for (const s of series) {
    const byDate = new Map(s.points.map((p) => [p.date_releve, p]));
    pointsByLabel.set(s.label, sortedDates.map((d) => byDate.get(d) ?? null));
  }

  return { labels, sortedDates, pointsByLabel };
}

export function LineChartTimeSeries({
  series,
  unite,
  onPointClick,
  height,
  formatLabel = formatDateShort,
  extraDates = [],
}: LineChartTimeSeriesProps) {
  const isSingle = series.length === 1;
  const yearBandsRef = useRef<YearBand[]>([]);

  const { data, mainPointsByDataset, sortedDates } = useMemo(() => {
    const { labels, pointsByLabel, sortedDates } = buildMultiSeriesData(series, formatLabel, extraDates);

    // Datasets principaux : un par série
    const mainPoints: (RelevePoint | null)[][] = [];
    type LineDataset = {
      label: string;
      data: (number | null)[];
      borderColor: string;
      backgroundColor: string;
      borderWidth: number;
      borderDash?: number[];
      tension?: number;
      pointRadius: number | number[];
      pointHoverRadius?: number;
      pointBackgroundColor?: string | string[];
      pointBorderColor?: string | string[];
      spanGaps?: boolean;
    };
    const datasets: LineDataset[] = series.map((s, idx) => {
      const points = pointsByLabel.get(s.label) ?? [];
      mainPoints.push(points);
      const lineColor = isSingle ? COLOR_LINE_NEUTRE : PALETTE[idx % PALETTE.length]!;
      const data = points.map((p) => (p ? p.valeur_mesuree : null));
      const pointBg = isSingle
        ? points.map((p) => pointColor(p?.est_conforme ?? null))
        : lineColor;
      return {
        label: s.label,
        data,
        borderColor: lineColor,
        backgroundColor: lineColor,
        borderWidth: 1.5,
        tension: 0.15,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: pointBg,
        pointBorderColor: pointBg,
        spanGaps: true,
      };
    });

    // Seuils dessinés pour chaque série qui en a — couleur de la série en semi-transparent
    // pour rester reliable visuellement à sa ligne. Filtrés de la légende plus bas.
    series.forEach((s, idx) => {
      const baseColor = isSingle ? COLOR_SEUIL : PALETTE[idx % PALETTE.length]!;
      const seuilColor = isSingle ? COLOR_SEUIL : withOpacity(baseColor, 0.55);
      const labelPrefix = isSingle ? "" : `${s.label} `;
      if (s.seuilMin !== null) {
        datasets.push({
          label: `${labelPrefix}min ${s.seuilMin}`,
          data: labels.map(() => s.seuilMin!),
          borderColor: seuilColor,
          backgroundColor: seuilColor,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
        });
      }
      if (s.seuilMax !== null) {
        datasets.push({
          label: `${labelPrefix}max ${s.seuilMax}`,
          data: labels.map(() => s.seuilMax!),
          borderColor: seuilColor,
          backgroundColor: seuilColor,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
        });
      }
    });

    return { data: { labels, datasets }, mainPointsByDataset: mainPoints, sortedDates };
  }, [series, isSingle, formatLabel, extraDates]);

  // Met à jour la ref des bandes années à chaque changement de dates,
  // sans recréer le plugin (qui resterait stable côté Chart.js).
  useEffect(() => {
    yearBandsRef.current = computeYearBands(sortedDates);
  }, [sortedDates]);

  const yearWatermarkPlugin = useMemo(() => makeYearWatermarkPlugin(yearBandsRef), []);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
        // Ne réagit qu'aux datasets principaux (les seuils sont à la fin et n'ont pas de pointRadius)
        const main = elements.find((e) => e.datasetIndex < mainPointsByDataset.length);
        if (!main) return;
        const point = mainPointsByDataset[main.datasetIndex]?.[main.index];
        if (point) onPointClick(point.id_ordre_travail);
      },
      onHover: (event: ChartEvent, elements: ActiveElement[]) => {
        const target = event.native?.target as HTMLElement | undefined;
        if (target) {
          target.style.cursor = elements.some((e) => e.datasetIndex < mainPointsByDataset.length)
            ? "pointer"
            : "default";
        }
      },
      plugins: {
        legend: {
          display: !isSingle,
          position: "bottom" as const,
          labels: {
            boxWidth: 12,
            font: { size: 10 },
            padding: 8,
            // On masque les datasets de seuils dans la légende — ils sont après les datasets principaux.
            filter: (item: { datasetIndex?: number }) =>
              (item.datasetIndex ?? 0) < mainPointsByDataset.length,
          },
        },
        tooltip: {
          filter: (item: TooltipItem<"line">) =>
            item.datasetIndex < mainPointsByDataset.length && item.parsed.y !== null,
          callbacks: {
            label: (ctx: TooltipItem<"line">) =>
              isSingle ? `${ctx.parsed.y} ${unite ?? ""}` : `${ctx.dataset.label} : ${ctx.parsed.y} ${unite ?? ""}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { ticks: { display: false }, grace: "10%" },
      },
    }),
    [unite, isSingle, mainPointsByDataset, onPointClick],
  );

  // Si height fourni → div avec hauteur fixe.
  // Sinon → 100 % du parent (le parent doit avoir une hauteur définie via flex/grid).
  return (
    <div style={height ? { height } : { height: "100%", minHeight: 0 }}>
      <Line data={data} options={options} plugins={[yearWatermarkPlugin]} />
    </div>
  );
}
