import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Focus, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { usePlanningAnnee } from "@/hooks/use-dashboard";
import type { PlanningEvent } from "@/lib/types/dashboard";

// ── Helpers ──

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function dateToWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return getISOWeek(new Date(y!, m! - 1, d!));
}

const MONTHS = [
  { label: "Jan", weeks: [1, 4] }, { label: "Fév", weeks: [5, 8] },
  { label: "Mar", weeks: [9, 13] }, { label: "Avr", weeks: [14, 17] },
  { label: "Mai", weeks: [18, 22] }, { label: "Jun", weeks: [23, 26] },
  { label: "Jul", weeks: [27, 30] }, { label: "Aoû", weeks: [31, 35] },
  { label: "Sep", weeks: [36, 39] }, { label: "Oct", weeks: [40, 44] },
  { label: "Nov", weeks: [45, 48] }, { label: "Déc", weeks: [49, 52] },
];

// Colonnes flexibles — pas de largeur fixe, s'adapte à la zone disponible
const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);

function barColor(statut: number, enRetard: boolean): string {
  if (enRetard) return "bg-destructive";
  switch (statut) {
    case 1: return "bg-blue-500";
    case 2: return "bg-yellow-500";
    case 3: return "bg-green-500";
    case 4: return "bg-muted";
    case 5: return "bg-orange-500";
    default: return "bg-muted";
  }
}

// ── Composant ──

export function Planning() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [focused, setFocused] = useState(false);
  const { data: events = [] } = usePlanningAnnee(year);

  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();
  const todayStr = new Date().toISOString().split("T")[0]!;

  // Grouper par famille → gamme → [{week, ot}]
  const grouped = useMemo(() => {
    const fmap = new Map<string, Map<string, Array<{ week: number; ot: PlanningEvent }>>>();
    for (const evt of events) {
      const f = evt.nom_famille ?? "Sans famille";
      if (!fmap.has(f)) fmap.set(f, new Map());
      const gmap = fmap.get(f)!;
      if (!gmap.has(evt.nom_gamme)) gmap.set(evt.nom_gamme, []);
      gmap.get(evt.nom_gamme)!.push({ week: dateToWeek(evt.date_prevue), ot: evt });
    }
    return Array.from(fmap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([famille, gmap]) => ({
        famille,
        gammes: Array.from(gmap.entries()).sort(([a], [b]) => a.localeCompare(b))
          .map(([g, items]) => ({ gamme: g, items })),
        count: Array.from(gmap.values()).reduce((s, a) => s + a.length, 0),
      }));
  }, [events]);



  // En mode focus : filtrer les familles qui ont des OT dans les 8 prochaines semaines
  const focusStart = currentWeek;
  const focusEnd = currentWeek + 8;
  const displayedGroups = focused
    ? grouped.filter(({ famille }) =>
        events.some((e) => (e.nom_famille ?? "Sans famille") === famille
          && dateToWeek(e.date_prevue) >= focusStart
          && dateToWeek(e.date_prevue) <= focusEnd))
    : grouped;

  const gridCols = "180px repeat(52, 1fr)";

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Planning">
        <TooltipProvider delay={300}>
          <div className="flex items-center gap-2">
            <HeaderButton icon={<ChevronLeft className="size-4" />} label="Année précédente" onClick={() => setYear((y) => y - 1)} />
            <span className="text-sm font-bold tabular-nums">{year}</span>
            <HeaderButton icon={<ChevronRight className="size-4" />} label="Année suivante" onClick={() => setYear((y) => y + 1)} />
            <HeaderButton icon={<Focus className="size-4" />} label="Focus 8 semaines" onClick={() => setFocused((f) => !f)} variant={focused ? "default" : "outline"} />
          </div>
        </TooltipProvider>
      </PageHeader>

      <div className="flex flex-1 flex-col rounded-md border min-h-0 overflow-y-auto no-scrollbar">
        {/* Headers mois + semaines — collés */}
        <div className="sticky top-0 z-20 bg-background border-b">
          <div className="grid" style={{ gridTemplateColumns: gridCols }}>
            <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground border-r" />
            {MONTHS.map((m) => {
              const span = m.weeks[1]! - m.weeks[0]! + 1;
              return (
                <div key={m.label} className="text-center text-[10px] font-semibold text-muted-foreground border-r py-1"
                  style={{ gridColumn: `span ${span}` }}>
                  {m.label}
                </div>
              );
            })}
          </div>
          <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          <div className="px-2 py-0.5 text-[9px] text-muted-foreground border-r">Famille / Gamme</div>
          {WEEKS.map((w) => (
            <div key={w} className={cn(
              "text-center text-[8px] py-0.5 border-r",
              year === currentYear && w === currentWeek ? "text-primary font-bold bg-primary/10" : "text-muted-foreground/50"
            )}>
              {w}
            </div>
          ))}
          </div>
        </div>

        {/* Contenu */}
        {displayedGroups.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Inbox className="size-12" />
              <h3 className="text-lg font-semibold text-foreground">Aucun OT en {year}</h3>
              <p className="max-w-sm text-sm text-center">Les ordres de travail apparaîtront ici une fois générés depuis les gammes.</p>
            </div>
          </div>
        ) : (
          <>
            {displayedGroups.map(({ famille, count }) => {
              return (
                <div key={famille} className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                  <div className="px-2 py-1 flex items-center gap-1.5 border-r overflow-hidden">
                    <span className="text-[10px] font-semibold truncate">{famille}</span>
                    <span className="text-[9px] text-muted-foreground">({count})</span>
                  </div>
                  {WEEKS.map((w) => {
                    const weekOts = events.filter((e) => (e.nom_famille ?? "Sans famille") === famille && dateToWeek(e.date_prevue) === w);
                    const first = weekOts.length > 0 ? weekOts[0]! : null;
                    const late = first ? first.date_prevue < todayStr && [1, 2, 5].includes(first.id_statut_ot) : false;
                    return (
                      <div key={w} className={cn(
                        first ? cn(barColor(first.id_statut_ot, late), "opacity-50") : "border-r",
                        !first && year === currentYear && w === currentWeek && "bg-primary/5"
                      )} />
                    );
                  })}
                </div>
              );
            })}

          </>
        )}
      </div>
    </div>
  );
}
