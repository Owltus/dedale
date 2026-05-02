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
 * Plugin Chart.js qui dessine l'année en gros filigrane par-dessus les datasets,
 * au centre de chaque bande année. Lisibilité assurée par un **contour blanc**
 * autour du texte foncé : reste lisible quelle que soit la couleur des barres
 * sous-jacentes, sans envahir visuellement le graphique.
 */
export function makeYearWatermarkPlugin(
  bandsRef: MutableRefObject<YearBand[]>,
): Plugin<"bar" | "line"> {
  return {
    id: "year-watermark",
    afterDraw(chart) {
      const xScale = chart.scales.x;
      const bands = bandsRef.current;
      if (!xScale || bands.length === 0) return;
      const { ctx, chartArea } = chart;
      const centerY = (chartArea.top + chartArea.bottom) / 2;
      const height = chartArea.bottom - chartArea.top;
      const fontSize = Math.max(20, Math.min(72, Math.round(height * 0.5)));

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.lineJoin = "round";
      ctx.fillStyle = "rgba(100, 116, 139, 0.55)"; // slate-500 discret
      ctx.strokeStyle = "rgba(51, 65, 85, 0.4)"; // slate-700 fin
      ctx.lineWidth = 1;

      for (const band of bands) {
        const xStart = xScale.getPixelForValue(band.startIdx);
        const xEnd = xScale.getPixelForValue(band.endIdx);
        const cx = (xStart + xEnd) / 2;
        const text = String(band.year);
        ctx.fillText(text, cx, centerY);
        ctx.strokeText(text, cx, centerY);
      }
      ctx.restore();
    },
  };
}

