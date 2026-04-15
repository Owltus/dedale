import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { useSunburstGammes } from "@/hooks/use-dashboard";
import { computeAggregateStatutId, STATUTS_GAMME } from "@/lib/utils/statuts";
import type { SunburstGamme } from "@/lib/types/dashboard";

// ── SVG constants ──

const SIZE = 500;
const CX = SIZE / 2;
const CY = SIZE / 2;
const GAP = 0.6; // gap uniforme entre tous les éléments (domaines, familles, gammes)

const RINGS = [
  { inner: 60, outer: 120 },   // domaine
  { inner: 125, outer: 175 },  // famille
  { inner: 180, outer: 230 },  // gamme
];

// Palette : teintes espacées de ~36° pour un contraste maximal, saturation 65-75%, lightness 50-55%
const DOMAIN_HUES = [
  { h: 215, s: 70, l: 52 }, // bleu
  { h: 30,  s: 75, l: 52 }, // orange
  { h: 150, s: 65, l: 42 }, // émeraude
  { h: 330, s: 65, l: 52 }, // rose
  { h: 265, s: 65, l: 55 }, // violet
  { h: 50,  s: 70, l: 48 }, // ocre
  { h: 185, s: 70, l: 45 }, // teal
  { h: 0,   s: 65, l: 50 }, // rouge brique
  { h: 105, s: 55, l: 45 }, // olive
  { h: 290, s: 55, l: 50 }, // prune
];


function levelColor(hue: { h: number; s: number; l: number }, level: number): string {
  const l = Math.min(90, hue.l + level * 12);
  const s = Math.max(30, hue.s - level * 10);
  return `hsl(${hue.h}, ${s}%, ${l}%)`;
}

function gammeStatutId(g: SunburstGamme): number {
  return computeAggregateStatutId({
    allInactive: !g.est_active,
    isEmpty: g.nb_ot_total === 0,
    nbReouvert: g.nb_ot_reouvert,
    nbRetard: g.nb_ot_en_retard,
    nbEnCours: g.nb_ot_en_cours,
    prochaineDate: g.prochaine_date,
    joursPeriodicite: g.jours_periodicite,
  });
}

// ── SVG helpers ──

function polarToXY(r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * (Math.PI / 180);
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
}

function ringArc(ring: { inner: number; outer: number }, startDeg: number, endDeg: number): string {
  const span = endDeg - startDeg;
  const large = span > 180 ? 1 : 0;
  const s1 = polarToXY(ring.outer, startDeg);
  const s2 = polarToXY(ring.outer, endDeg);
  const s3 = polarToXY(ring.inner, endDeg);
  const s4 = polarToXY(ring.inner, startDeg);
  return [
    `M ${s1.x} ${s1.y}`,
    `A ${ring.outer} ${ring.outer} 0 ${large} 1 ${s2.x} ${s2.y}`,
    `L ${s3.x} ${s3.y}`,
    `A ${ring.inner} ${ring.inner} 0 ${large} 0 ${s4.x} ${s4.y}`,
    "Z",
  ].join(" ");
}

interface ArcDef {
  path: string;
  color: string;
  tooltip: string;
  opacity: number;
  href: string;
  reglementaire: boolean;
  domainIdx: number;
}

function buildArcs(data: SunburstGamme[]): { arcs: ArcDef[]; validCount: number } {
  if (data.length === 0) return { arcs: [], validCount: 0 };

  // Grouper par domaine (avec id) → famille (avec id) → gammes
  const domains = new Map<string, { id: number; families: Map<string, { id: number; gammes: SunburstGamme[] }> }>();
  for (const g of data) {
    if (!domains.has(g.nom_domaine)) domains.set(g.nom_domaine, { id: g.id_domaine_gamme, families: new Map() });
    const dom = domains.get(g.nom_domaine)!;
    if (!dom.families.has(g.nom_famille)) dom.families.set(g.nom_famille, { id: g.id_famille_gamme, gammes: [] });
    dom.families.get(g.nom_famille)!.gammes.push(g);
  }

  // Calculer le total de gaps à tous les niveaux pour répartir l'espace
  let totalFamCount = 0;
  let totalGammeCount = 0;
  for (const dom of domains.values()) {
    totalFamCount += dom.families.size;
    for (const fam of dom.families.values()) totalGammeCount += fam.gammes.length;
  }
  const domainCount = domains.size;
  const totalGaps = domainCount * GAP + totalFamCount * GAP + Math.max(0, totalGammeCount - totalFamCount) * GAP;
  const available = 360 - totalGaps;
  const arcs: ArcDef[] = [];
  let validCount = 0;

  let angle = 0;
  let di = 0;
  for (const [domName, dom] of domains) {
    const hue = DOMAIN_HUES[di % DOMAIN_HUES.length]!;
    const gammeCount = Array.from(dom.families.values()).reduce((s, f) => s + f.gammes.length, 0);
    // L'espace du domaine = proportion de gammes × espace disponible + gaps internes (familles + gammes)
    const famCount = dom.families.size;
    const innerFamGaps = famCount * GAP;
    const innerGamGaps = Math.max(0, gammeCount - famCount) * GAP;
    const domDataSpan = (gammeCount / data.length) * available;
    const domSpan = domDataSpan + innerFamGaps + innerGamGaps;

    arcs.push({
      path: ringArc(RINGS[0]!, angle, angle + domSpan),
      color: levelColor(hue, 0),
      tooltip: `${domName} (${gammeCount} gammes)`,
      opacity: 1,
      href: `/gammes/domaines/${dom.id}`,
      reglementaire: false,
      domainIdx: di,
    });

    let famAngle = angle;
    for (const [famName, fam] of dom.families) {
      const famGamGaps = Math.max(0, fam.gammes.length - 1) * GAP;
      const famDataSpan = (fam.gammes.length / data.length) * available;
      const famSpan = famDataSpan + famGamGaps;

      arcs.push({
        path: ringArc(RINGS[1]!, famAngle, famAngle + famSpan),
        color: levelColor(hue, 1),
        tooltip: `${famName} (${fam.gammes.length} gammes)`,
        opacity: 1,
        href: `/gammes/familles/${fam.id}`,
        reglementaire: false,
        domainIdx: di,
      });

      const gammeDataSpan = famDataSpan / fam.gammes.length;
      let gamAngle = famAngle;
      for (let gi = 0; gi < fam.gammes.length; gi++) {
        const g = fam.gammes[gi]!;
        const sid = gammeStatutId(g);
        const isValid = sid === 1;
        if (isValid) validCount++;
        const statutLabel = STATUTS_GAMME[sid]?.label ?? "Inconnu";

        arcs.push({
          path: ringArc(RINGS[2]!, gamAngle, gamAngle + gammeDataSpan),
          color: levelColor(hue, 2),
          tooltip: `${g.nom_gamme} — ${statutLabel}${g.est_reglementaire ? " ⚖" : ""}`,
          opacity: isValid ? 1 : 0.3,
          href: `/gammes/${g.id_gamme}`,
          reglementaire: !!g.est_reglementaire,
          domainIdx: di,
        });
        gamAngle += gammeDataSpan + (gi < fam.gammes.length - 1 ? GAP : 0);
      }
      famAngle += famSpan + GAP;
    }
    angle += domSpan + GAP;
    di++;
  }
  return { arcs, validCount };
}

/// Graphique sunburst domaine → famille → gamme
export function GammeSunburst() {
  const { data } = useSunburstGammes();
  const navigate = useNavigate();
  const [tooltip, setTooltip] = useState<{ text: string; cx: number; cy: number } | null>(null);

  const { arcs, pct } = useMemo(() => {
    if (!data || data.length === 0) return { arcs: [], pct: 0 };
    const result = buildArcs(data);
    return { arcs: result.arcs, pct: Math.round((result.validCount / data.length) * 100) };
  }, [data]);

  if (!data || data.length === 0) return null;

  return (
    <Card className="py-0 gap-0 grow-0 shrink-0 basis-1/5 min-w-36 flex flex-col">
      <p className="text-[11px] font-medium text-muted-foreground text-center pt-1 px-1">Complétion gammes</p>
      <div className="flex-1 min-h-0 relative p-1">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full">
          <defs>
            {DOMAIN_HUES.map((hue, i) => (
              <pattern key={i} id={`regl-${i}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke={levelColor(hue, 0)} strokeWidth="2" opacity="0.7" />
              </pattern>
            ))}
          </defs>
          <text x={CX} y={CY} textAnchor="middle" dominantBaseline="central"
            className="fill-foreground text-[36px] font-semibold">{pct}%</text>
          {arcs.map((arc, i) => (
            <g key={i}
              className="hover:opacity-100 cursor-pointer"
              onClick={() => navigate(arc.href)}
              onMouseEnter={(e) => setTooltip({ text: arc.tooltip, cx: e.clientX, cy: e.clientY })}
              onMouseMove={(e) => setTooltip((t) => t ? { ...t, cx: e.clientX, cy: e.clientY } : null)}
              onMouseLeave={() => setTooltip(null)}
            >
              <path d={arc.path} fill={arc.color} opacity={arc.opacity} />
              {arc.reglementaire && (
                <path d={arc.path} fill={`url(#regl-${arc.domainIdx})`} />
              )}
            </g>
          ))}
        </svg>
        {tooltip && (
          <div className="fixed pointer-events-none bg-popover text-popover-foreground border rounded px-2 py-1 text-xs shadow-md whitespace-nowrap z-50"
            style={{ left: tooltip.cx + 8, top: tooltip.cy - 32 }}>
            {tooltip.text}
          </div>
        )}
      </div>
    </Card>
  );
}
