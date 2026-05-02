import { useEffect, useMemo, useRef } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  type ActiveElement,
  type ChartEvent,
  type TooltipItem,
} from "chart.js";
import { formatDateShort } from "@/lib/utils/format";
import { findContainingJalon } from "@/lib/utils/cadence";
import type { RelevePoint } from "@/lib/types/releves";
import type { ChartSeries } from "./LineChartTimeSeries";
import { computeYearBands, makeYearWatermarkPlugin, type YearBand } from "./chartPlugins";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export type BarMode = "delta" | "raw";

interface BarChartRelevesProps {
  series: ChartSeries[];
  unite: string | null;
  /** `delta` = Δ entre relevés successifs (compteurs) ; `raw` = valeur brute. */
  mode: BarMode;
  onPointClick: (idOt: number) => void;
  /** Hauteur fixe en pixels. Si omis, le composant occupe 100 % de la hauteur du parent. */
  height?: number;
  /** Formatage des labels de l'axe X. Par défaut : `formatDateShort`. */
  formatLabel?: (iso: string) => string;
  /** Dates ISO supplémentaires à inclure dans l'axe X (sans données associées). */
  extraDates?: string[];
}

const PALETTE = [
  "rgb(59, 130, 246)",
  "rgb(168, 85, 247)",
  "rgb(236, 72, 153)",
  "rgb(245, 158, 11)",
  "rgb(20, 184, 166)",
  "rgb(132, 204, 22)",
  "rgb(251, 113, 133)",
  "rgb(99, 102, 241)",
];

interface BarPoint {
  date: string;
  /// `null` = changement de compteur détecté (Δ négatif), barre masquée.
  valeur: number | null;
  point: RelevePoint;
}

/// Δ entre points consécutifs (point N − point N-1). Premier point omis.
/// Si Δ < 0 (impossible sur un compteur cumulatif), on suppose un changement
/// de compteur (remise à zéro) et on skip la barre via `null`.
function buildDeltas(points: RelevePoint[]): BarPoint[] {
  return points.slice(1).map((p, i) => {
    const delta = p.valeur_mesuree - points[i]!.valeur_mesuree;
    return {
      date: p.date_releve,
      valeur: delta < 0 ? null : delta,
      point: p,
    };
  });
}

/// Valeurs brutes telles que relevées (chaque point à sa date exacte).
function buildRaw(points: RelevePoint[]): BarPoint[] {
  return points.map((p) => ({
    date: p.date_releve,
    valeur: p.valeur_mesuree,
    point: p,
  }));
}

/// Valeurs brutes snappées sur le jalon majoritaire de la période entre 2 relevés.
/// Même règle que `bucketDelta` (cf. plus bas) : on calcule l'intersection de la période
/// `[date_n-1, date_n]` avec chaque jalon, et on attribue la VALEUR (pas un Δ) du relevé
/// courant au jalon où la période a passé le plus de temps.
///
/// Conséquence : un relevé pour l'OT prévu fin mars mais saisi le 1er avril sera attribué
/// à mars (parce que la période depuis le précédent relevé tombe majoritairement en mars),
/// au lieu d'être bêtement snappé sur le mois de saisie.
///
/// Pour le 1er point (pas de précédent), fallback : règle "jalon ≤ date".
function buildRawSnapped(points: RelevePoint[], jalons: string[]): BarPoint[] {
  if (jalons.length === 0) return buildRaw(points);
  if (points.length === 0) return [];
  const jalonsTimes = jalons.map((j) => new Date(j).getTime());
  const byJalon = new Map<string, BarPoint>();

  // 1er point : jalon ≤ date (pas de précédent pour calculer une période)
  const first = points[0]!;
  const firstBucket = findContainingJalon(first.date_releve, jalonsTimes, jalons);
  if (firstBucket) {
    byJalon.set(firstBucket, { date: firstBucket, valeur: first.valeur_mesuree, point: first });
  }

  // Points suivants : bucket = jalon majoritaire de la période [date_n-1, date_n]
  for (let i = 1; i < points.length; i++) {
    const bucket = bucketDelta(points, i, jalonsTimes);
    if (!bucket) continue;
    const existing = byJalon.get(bucket);
    if (!existing || points[i]!.date_releve > existing.point.date_releve) {
      byJalon.set(bucket, { date: bucket, valeur: points[i]!.valeur_mesuree, point: points[i]! });
    }
  }

  return Array.from(byJalon.values()).sort((a, b) => a.date.localeCompare(b.date));
}


/// Pour un Δ entre deux relevés, retourne le jalon (mois/semaine) qui contient la
/// **plus grande portion** de la période [date_n-1, date_n].
///
/// Cette règle absorbe les habitudes humaines de saisie : un relevé fait fin février
/// OU début mars représente toujours la conso de février, parce que ~28 jours de la
/// période tombent en février et seulement quelques-uns en mars.
function bucketDelta(
  points: RelevePoint[],
  index: number,
  jalonsTimes: number[],
): string | null {
  if (jalonsTimes.length === 0 || index === 0) return null;
  const prev = new Date(points[index - 1]!.date_releve).getTime();
  const curr = new Date(points[index]!.date_releve).getTime();
  let bestIdx = -1;
  let bestDuration = 0;
  for (let i = 0; i < jalonsTimes.length; i++) {
    const startBucket = jalonsTimes[i]!;
    const endBucket = i + 1 < jalonsTimes.length ? jalonsTimes[i + 1]! : Number.POSITIVE_INFINITY;
    const interStart = Math.max(prev, startBucket);
    const interEnd = Math.min(curr, endBucket);
    const duration = Math.max(0, interEnd - interStart);
    if (duration > bestDuration) {
      bestDuration = duration;
      bestIdx = i;
    }
  }
  if (bestIdx === -1) return null;
  return new Date(jalonsTimes[bestIdx]!).toISOString().slice(0, 10);
}

/// Construit les Δ "bucketés" sur les jalons fournis. Plusieurs Δ qui tombent dans
/// le même bucket sont sommés (cas rare avec relevés très rapprochés).
function buildDeltasBucketed(points: RelevePoint[], jalons: string[]): BarPoint[] {
  if (jalons.length === 0) return buildDeltas(points);
  const jalonsTimes = jalons.map((j) => new Date(j).getTime());
  const byBucket = new Map<string, BarPoint>();
  for (let i = 1; i < points.length; i++) {
    const bucket = bucketDelta(points, i, jalonsTimes);
    if (!bucket) continue;
    const delta = points[i]!.valeur_mesuree - points[i - 1]!.valeur_mesuree;
    const existing = byBucket.get(bucket);
    if (existing && existing.valeur !== null && delta >= 0) {
      existing.valeur += delta;
      // Conserve le point le plus récent comme cible du clic
      if (points[i]!.date_releve > existing.point.date_releve) existing.point = points[i]!;
    } else {
      byBucket.set(bucket, {
        date: bucket,
        valeur: delta < 0 ? null : delta,
        point: points[i]!,
      });
    }
  }
  return Array.from(byBucket.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function BarChartReleves({
  series,
  unite,
  mode,
  onPointClick,
  height,
  formatLabel = formatDateShort,
  extraDates = [],
}: BarChartRelevesProps) {
  const isSingle = series.length === 1;
  const yearBandsRef = useRef<YearBand[]>([]);

  const { data, barsByDataset, sortedDates } = useMemo(() => {
    // Quand des jalons (extraDates) sont fournis, l'axe X = jalons UNIQUEMENT, et :
    //  - mode delta : les Δ sont bucketés par intersection majoritaire (cf. bucketDelta)
    //  - mode raw   : chaque relevé est snappé sur le jalon le plus proche
    // Sans jalons : axe X = union des dates des relevés (mode legacy).
    const useJalons = extraDates.length > 0;
    const barsPerSeries = useJalons
      ? series.map((s) => (mode === "delta"
          ? buildDeltasBucketed(s.points, extraDates)
          : buildRawSnapped(s.points, extraDates)))
      : series.map((s) => (mode === "delta" ? buildDeltas(s.points) : buildRaw(s.points)));

    const allDates = new Set<string>(extraDates);
    if (!useJalons) {
      for (const bars of barsPerSeries) {
        for (const b of bars) allDates.add(b.date);
      }
    }
    const sortedDates = Array.from(allDates).sort();
    const labels = sortedDates.map(formatLabel);

    const aligned: (BarPoint | null)[][] = [];
    const datasets = series.map((s, idx) => {
      const bars = barsPerSeries[idx]!;
      const byDate = new Map(bars.map((b) => [b.date, b]));
      const alignedBars = sortedDates.map((d) => byDate.get(d) ?? null);
      aligned.push(alignedBars);
      const color = PALETTE[idx % PALETTE.length]!;
      return {
        label: s.label,
        // On masque les valeurs exactement à 0 (= compteur stable, puissance nulle hors saison) :
        // l'utilisateur ne veut voir que les données "réelles", pas les zéros qui polluent.
        data: alignedBars.map((b) => (b && b.valeur !== 0 ? b.valeur : null)),
        backgroundColor: color,
        borderColor: color,
        borderRadius: 2,
      };
    });

    return { data: { labels, datasets }, barsByDataset: aligned, sortedDates };
  }, [series, mode, formatLabel, extraDates]);

  useEffect(() => {
    yearBandsRef.current = computeYearBands(sortedDates);
  }, [sortedDates]);

  const yearWatermarkPlugin = useMemo(() => makeYearWatermarkPlugin(yearBandsRef), []);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
        const main = elements[0];
        if (!main) return;
        const bar = barsByDataset[main.datasetIndex]?.[main.index];
        if (bar) onPointClick(bar.point.id_ordre_travail);
      },
      onHover: (event: ChartEvent, elements: ActiveElement[]) => {
        const target = event.native?.target as HTMLElement | undefined;
        if (target) target.style.cursor = elements.length > 0 ? "pointer" : "default";
      },
      plugins: {
        legend: {
          display: !isSingle,
          position: "bottom" as const,
          labels: { boxWidth: 12, font: { size: 10 }, padding: 8 },
        },
        tooltip: {
          filter: (item: TooltipItem<"bar">) => item.parsed.y !== null,
          callbacks: {
            label: (ctx: TooltipItem<"bar">) => {
              const v = ctx.parsed.y ?? 0;
              const sign = mode === "delta" && v > 0 ? "+" : "";
              const prefix = isSingle ? "" : `${ctx.dataset.label} : `;
              return `${prefix}${sign}${v} ${unite ?? ""}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { ticks: { display: false }, beginAtZero: true, grace: "10%" },
      },
    }),
    [unite, isSingle, mode, barsByDataset, onPointClick],
  );

  // Si height fourni → div avec hauteur fixe.
  // Sinon → 100 % du parent (le parent doit avoir une hauteur définie via flex/grid).
  return (
    <div style={height ? { height } : { height: "100%", minHeight: 0 }}>
      <Bar data={data} options={options} plugins={[yearWatermarkPlugin]} />
    </div>
  );
}
