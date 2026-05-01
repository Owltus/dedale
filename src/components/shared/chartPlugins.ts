import type { Plugin } from "chart.js";
import type { MutableRefObject } from "react";

export interface YearBand {
  year: number;
  startIdx: number;
  endIdx: number;
}

/**
 * Calcule les bandes années à partir d'un tableau de dates ISO triées.
 * Chaque bande regroupe des indices consécutifs partageant la même année.
 */
export function computeYearBands(isoDates: string[]): YearBand[] {
  if (isoDates.length === 0) return [];
  const bands: YearBand[] = [];
  let start = 0;
  let currentYear = new Date(isoDates[0]!).getFullYear();
  for (let i = 1; i <= isoDates.length; i++) {
    const y = i < isoDates.length ? new Date(isoDates[i]!).getFullYear() : undefined;
    if (y !== currentYear) {
      bands.push({ year: currentYear, startIdx: start, endIdx: i - 1 });
      if (y === undefined) break;
      start = i;
      currentYear = y;
    }
  }
  return bands;
}

/**
 * Plugin Chart.js qui dessine l'année en gros filigrane derrière les datasets,
 * au centre de chaque bande année. Lit les bandes via une ref pour rester
 * stable (recréation = perte de perf et flicker).
 */
export function makeYearWatermarkPlugin(
  bandsRef: MutableRefObject<YearBand[]>,
): Plugin<"bar" | "line"> {
  return {
    id: "year-watermark",
    beforeDatasetsDraw(chart) {
      const xScale = chart.scales.x;
      const bands = bandsRef.current;
      if (!xScale || bands.length === 0) return;
      const { ctx, chartArea } = chart;
      const centerY = (chartArea.top + chartArea.bottom) / 2;
      const height = chartArea.bottom - chartArea.top;
      const fontSize = Math.max(18, Math.min(64, Math.round(height * 0.45)));
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
  };
}

