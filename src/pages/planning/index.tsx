import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, Focus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HeaderButton } from "@/components/shared/HeaderButton";
import { OtList } from "@/components/shared/OtList";
import { usePlanningAnnee } from "@/hooks/use-dashboard";
import { useOtByIds } from "@/hooks/use-ordres-travail";
import {
  getISOWeekDate, dateToWeekInfo, getEffectiveDate,
  buildWeeksYearHeaders, buildWeeksMonthHeaders, computeGlissantWeeks,
  getCellPriority, priorityColor, computeVisibleWeeks,
  yearLabel, monthLabel,
  CELL_SIZE,
  type CellData,
} from "./helpers";

const SEPARATOR_STYLE = { width: 2, minWidth: 2, maxWidth: 2, padding: 0 };

export function Planning() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [visibleCount, setVisibleCount] = useState(26);
  const [wrapperWidth, setWrapperWidth] = useState(0);
  const [hoverWeek, setHoverWeek] = useState<string | null>(null);
  const [hoverFamily, setHoverFamily] = useState<string | null>(null);
  const navigate = useNavigate();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const { isoWeek: currentWeek, isoYear: currentISOYear } = getISOWeekDate(new Date());
  const todayStr = new Date().toISOString().split("T")[0]!;
  const currentWeekKey = `${currentISOYear}-${currentWeek}`;

  // ── Mesure conteneur ──

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const cw = el.clientWidth;
        const ow = el.offsetWidth;
        const c = computeVisibleWeeks(cw);
        setVisibleCount((prev) => prev === c ? prev : c);
        setWrapperWidth((prev) => Math.abs(prev - ow) < 1 ? prev : ow);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  // ── Semaines visibles ──

  const displayWeeks = useMemo(
    () => computeGlissantWeeks(currentISOYear, currentWeek, weekOffset, visibleCount),
    [currentISOYear, currentWeek, weekOffset, visibleCount],
  );

  // ── Data — fetch jusqu'à 3 années pour les écrans larges ──

  const [fetchA, fetchB, fetchC] = useMemo(() => {
    if (displayWeeks.length === 0) return [currentISOYear, currentISOYear, currentISOYear];
    const years = [...new Set(displayWeeks.map((w) => w.year))].sort();
    return [years[0]!, years[1] ?? years[0]!, years[2] ?? years[1] ?? years[0]!];
  }, [displayWeeks, currentISOYear]);

  const { data: eventsA = [] } = usePlanningAnnee(fetchA);
  const { data: eventsB = [] } = usePlanningAnnee(fetchB);
  const { data: eventsC = [] } = usePlanningAnnee(fetchC);
  const baselineAlreadyFetched = fetchA === currentISOYear || fetchB === currentISOYear || fetchC === currentISOYear;
  const { data: baselineRaw = [] } = usePlanningAnnee(baselineAlreadyFetched ? fetchA : currentISOYear);
  const baselineEvents = baselineAlreadyFetched ? eventsA : baselineRaw;
  const events = useMemo(() => {
    if (fetchA === fetchB && fetchB === fetchC) return eventsA;
    const seen = new Set<number>();
    const result = [];
    for (const list of [eventsA, eventsB, eventsC]) {
      for (const e of list) {
        if (!seen.has(e.id_ordre_travail)) { seen.add(e.id_ordre_travail); result.push(e); }
      }
    }
    return result;
  }, [eventsA, eventsB, eventsC, fetchA, fetchB, fetchC]);
  const { data: modalOts = [] } = useOtByIds(selectedIds);

  // ── Groupement par domaine → familles ──

  const allFamilies = useMemo(() => {
    const domainMap = new Map<string, Set<string>>();
    const familyIdMap = new Map<string, number>();
    for (const list of [baselineEvents, events]) {
      for (const ot of list) {
        const d = ot.nom_domaine ?? "Autre";
        const f = ot.nom_famille ?? "Sans famille";
        if (!domainMap.has(d)) domainMap.set(d, new Set());
        domainMap.get(d)!.add(f);
        if (ot.id_famille_gamme && !familyIdMap.has(f)) familyIdMap.set(f, ot.id_famille_gamme);
      }
    }
    const sorted = Array.from(domainMap.entries())
      .sort(([a], [b]) => a.localeCompare(b));
    const families: string[] = [];
    const domainBreaks = new Set<string>();
    for (const [, famSet] of sorted) {
      const fams = Array.from(famSet).sort((a, b) => a.localeCompare(b));
      if (families.length > 0) domainBreaks.add(fams[0]!);
      families.push(...fams);
    }
    return { families, domainBreaks, familyIdMap };
  }, [baselineEvents, events]);

  const cellLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, CellData>>();
    for (const ot of events) {
      const wi = dateToWeekInfo(getEffectiveDate(ot));
      const f = ot.nom_famille ?? "Sans famille";
      if (!lookup.has(f)) lookup.set(f, new Map());
      const wmap = lookup.get(f)!;
      const existing = wmap.get(wi.key);
      if (existing) {
        existing.events.push(ot);
        if (ot.est_reglementaire) existing.reglementaire = true;
      } else {
        wmap.set(wi.key, { events: [ot], reglementaire: !!ot.est_reglementaire });
      }
    }
    return lookup;
  }, [events]);

  // ── Filtrage ──

  const searchLower = search.toLowerCase();
  const displayedFamilies = useMemo(() => {
    let list = allFamilies.families;
    if (searchLower) list = list.filter((f) => f.toLowerCase().includes(searchLower));
    if (focused) {
      const futureKeys = new Set<string>();
      for (let i = 0; i < 12; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i * 7 + 3);
        const { isoYear, isoWeek } = getISOWeekDate(d);
        futureKeys.add(`${isoYear}-${isoWeek}`);
      }
      list = list.filter((f) => {
        const wmap = cellLookup.get(f);
        return wmap && Array.from(wmap.keys()).some((k) => futureKeys.has(k));
      });
    }
    return list;
  }, [allFamilies, searchLower, focused, cellLookup]);

  const yearHeaders = useMemo(() => buildWeeksYearHeaders(displayWeeks), [displayWeeks]);

  // Semaines en début d'année (pour bordure séparatrice épaisse)
  const yearBoundaryKeys = useMemo(() => {
    const set = new Set<string>();
    let prevYear = -1;
    for (const w of displayWeeks) {
      if (prevYear !== -1 && w.year !== prevYear) set.add(w.key);
      prevYear = w.year;
    }
    return set;
  }, [displayWeeks]);
  const monthHeaders = useMemo(() => buildWeeksMonthHeaders(displayWeeks), [displayWeeks]);

  // ── Navigation ──

  const goForward = () => setWeekOffset((o) => o + 13);
  const goBack = () => setWeekOffset((o) => o - 13);
  const goToday = () => setWeekOffset(0);

  const periodLabel = useMemo(() => {
    if (displayWeeks.length === 0) return "";
    const first = displayWeeks[0]!;
    const last = displayWeeks[displayWeeks.length - 1]!;
    if (first.year === last.year) return `${first.year} · S${first.week}–${last.week}`;
    return `${first.year} S${first.week} → ${last.year} S${last.week}`;
  }, [displayWeeks]);

  // ── Interactions ──

  const handleCellClick = (cell: CellData) => {
    if (cell.events.length === 1) navigate(`/ordres-travail/${cell.events[0]!.id_ordre_travail}`);
    else setSelectedIds(cell.events.map((e) => e.id_ordre_travail));
  };
  const handleMouseEnter = (wk: string, f: string) => { setHoverWeek(wk); setHoverFamily(f); };
  const handleMouseLeave = () => { setHoverWeek(null); setHoverFamily(null); };

  // ── Dimensions ──

  const exactLabelW = Math.max(160, wrapperWidth - visibleCount * CELL_SIZE);
  const cellStyle = { width: CELL_SIZE, minWidth: CELL_SIZE, maxWidth: CELL_SIZE, height: CELL_SIZE };
  const labelStyle = { width: exactLabelW, minWidth: exactLabelW, maxWidth: exactLabelW, height: CELL_SIZE };

  return (
    <div className="flex h-full flex-col p-4 gap-3 min-h-0 min-w-0">
      <PageHeader title="Planning" />

      <div className="flex-1 flex flex-col min-h-0 min-w-0 rounded-md border overflow-hidden">
        <TooltipProvider delay={300}>
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrer..."
                className="h-8 w-36 pl-7 text-xs" />
            </div>
            <HeaderButton icon={<Focus className="size-4" />} label="Focus 12 semaines"
              onClick={() => setFocused((f) => !f)} variant={focused ? "default" : "outline"} />
            <div className="flex-1" />
            <HeaderButton icon={<ChevronsLeft className="size-4" />} label="Trimestre précédent" onClick={goBack} />
            <button type="button" onClick={goToday}
              className="text-sm font-bold tabular-nums min-w-40 text-center hover:text-primary transition-colors cursor-pointer">
              {periodLabel}
            </button>
            <HeaderButton icon={<ChevronsRight className="size-4" />} label="Trimestre suivant" onClick={goForward} />
          </div>
        </TooltipProvider>

        <div ref={wrapperRef} className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden"
          onMouseLeave={handleMouseLeave}>
          <table className="border-separate border-spacing-0">
            <thead className="sticky top-0 z-20 bg-background">
              <tr>
                <th className="sticky left-0 z-40 bg-background border-b border-r p-0" style={{ ...labelStyle, height: undefined }} rowSpan={3} />
                {yearHeaders.map((y, i) => (
                  <Fragment key={`y-${i}`}>
                    {i > 0 && <th rowSpan={3} className="bg-muted-foreground/30" style={SEPARATOR_STYLE} />}
                    <th colSpan={y.span}
                      className={cn("text-center font-bold text-foreground border-b border-r py-0.5 bg-background overflow-hidden",
                        y.span < 2 ? "text-[7px]" : "text-[11px]",
                      )}>
                      {yearLabel(y.value, y.span)}
                    </th>
                  </Fragment>
                ))}
              </tr>
              <tr>
                {monthHeaders.map((m, i) => (
                  <th key={`m-${i}`} colSpan={m.span}
                    className={cn("text-center font-semibold text-muted-foreground border-b border-r py-0.5 bg-background overflow-hidden",
                      m.span < 2 ? "text-[7px]" : "text-[10px]",
                    )}>
                    {monthLabel(m.value, m.span)}
                  </th>
                ))}
              </tr>
              <tr>
                {displayWeeks.map((w) => (
                  <th key={w.key} style={cellStyle}
                    className={cn("text-center text-[8px] py-0.5 border-b bg-background",
                      w.key === currentWeekKey ? "text-primary font-bold border-x-2 border-x-blue-500 bg-primary/10" : "text-muted-foreground/50 border-r",
                    )}>{w.week}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedFamilies.map((famille) => (<Fragment key={famille}>
                {allFamilies.domainBreaks.has(famille) && (
                  <tr>
                    <td className="sticky left-0 z-30 p-0 bg-muted/60" style={{ ...labelStyle, height: 4 }} />
                    {displayWeeks.map((w) => {
                      const isCurr = w.key === currentWeekKey;
                      const sep = yearBoundaryKeys.has(w.key)
                        ? <td key={`sep-${w.key}`} className="bg-muted-foreground/30" style={SEPARATOR_STYLE} />
                        : null;
                      return (
                        <Fragment key={w.key}>{sep}
                          <td className={cn("p-0 bg-muted/60", isCurr && "border-x-2 border-x-blue-500")}
                            style={{ ...cellStyle, height: 4 }} />
                        </Fragment>
                      );
                    })}
                  </tr>
                )}
                <tr>
                  <td className={cn("sticky left-0 z-30 border-b border-r px-2 py-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] transition-colors",
                    hoverFamily === famille ? "bg-muted" : "bg-background")}
                    style={labelStyle}>
                    <div onClick={() => { const id = allFamilies.familyIdMap.get(famille); if (id) navigate(`/gammes/familles/${id}`); }}
                      className={cn("flex items-center h-full min-w-0", allFamilies.familyIdMap.has(famille) && "cursor-pointer hover:text-primary")}>
                      <span className="text-[10px] font-semibold truncate">{famille}</span>
                    </div>
                  </td>
                  {displayWeeks.map((w) => {
                    const cell = cellLookup.get(famille)?.get(w.key);
                    const isCurr = w.key === currentWeekKey;
                    const isHovered = (hoverWeek === w.key || hoverFamily === famille) && !(hoverWeek === w.key && hoverFamily === famille);
                    const sep = yearBoundaryKeys.has(w.key)
                      ? <td key={`sep-${w.key}`} className="bg-muted-foreground/30" style={SEPARATOR_STYLE} />
                      : null;
                    if (!cell) {
                      return (
                        <Fragment key={w.key}>{sep}
                          <td style={cellStyle}
                            onMouseEnter={() => handleMouseEnter(w.key, famille)}
                            className={cn("border-b border-r p-0 transition-colors",
                              isCurr && "border-x-2 border-x-blue-500",
                              isHovered && "bg-muted",
                            )} />
                        </Fragment>
                      );
                    }
                    const priority = getCellPriority(cell.events, todayStr);
                    return (
                      <Fragment key={w.key}>{sep}
                        <td style={cellStyle}
                          onClick={() => handleCellClick(cell)}
                          onMouseEnter={() => handleMouseEnter(w.key, famille)}
                          className={cn("border-b p-0 cursor-pointer text-center",
                            priorityColor(priority),
                            cell.reglementaire && "outline outline-[2.5px] -outline-offset-[2.5px] outline-yellow-400",
                            isCurr && "border-x-2 border-x-blue-500",
                          )}>
                          {cell.events.length > 1 && <span className="text-[11px] font-bold leading-none text-white drop-shadow-sm">{cell.events.length}</span>}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              </Fragment>))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={selectedIds.length > 0} onOpenChange={(open) => { if (!open) setSelectedIds([]); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>Ordres de travail ({selectedIds.length})</DialogTitle>
            <DialogDescription>Sélectionnez un ordre de travail pour voir son détail</DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-hidden px-3 pb-3">
            <OtList data={modalOts} showTitle={false} showSearch={false} showDateRange={false} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
