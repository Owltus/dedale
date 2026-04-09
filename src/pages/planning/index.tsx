import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
  getISOWeekDate, getISOWeeksInYear, dateToWeekInfo, getEffectiveDate,
  buildYearMonthHeaders, buildWeeksMonthHeaders, computeGlissantWeeks,
  getCellPriority, priorityColor, computeVisibleWeeks,
  CELL_SIZE, CELL_STEP, LABEL_COL,
  type WeekInfo, type CellData,
} from "./helpers";

type Mode = "glissant" | "annee";

export function Planning() {
  const [mode, setMode] = useState<Mode>("glissant");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [glissantCount, setGlissantCount] = useState(26);
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hoverWeekRef = useRef<string | null>(null);
  const hoverFamilyRef = useRef<string | null>(null);
  const rafRef = useRef(0);

  const { isoWeek: currentWeek, isoYear: currentISOYear } = getISOWeekDate(new Date());
  const todayStr = new Date().toISOString().split("T")[0]!;
  const currentWeekKey = `${currentISOYear}-${currentWeek}`;
  const isAnnee = mode === "annee";

  // ── Mesure conteneur → glissantCount directement (pas de state intermédiaire) ──

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const count = computeVisibleWeeks(el.getBoundingClientRect().width);
        setGlissantCount((prev) => prev === count ? prev : count);
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { cancelAnimationFrame(rafRef.current); ro.disconnect(); };
  }, []);

  // ── Semaines visibles ──

  const weeksInYear = useMemo(() => getISOWeeksInYear(year), [year]);
  const allYearWeeks = useMemo<WeekInfo[]>(
    () => Array.from({ length: weeksInYear }, (_, i) => ({ year, week: i + 1, key: `${year}-${i + 1}` })),
    [year, weeksInYear],
  );
  const glissantWeeks = useMemo(
    () => mode === "glissant" ? computeGlissantWeeks(currentISOYear, currentWeek, weekOffset, glissantCount) : [],
    [mode, currentISOYear, currentWeek, weekOffset, glissantCount],
  );
  const displayWeeks = isAnnee ? allYearWeeks : glissantWeeks;

  // ── Data — dédupliqué au croisement d'années ──

  const [fetchA, fetchB] = useMemo(() => {
    if (isAnnee) return [year, year];
    if (glissantWeeks.length === 0) return [currentISOYear, currentISOYear];
    return [glissantWeeks[0]!.year, glissantWeeks[glissantWeeks.length - 1]!.year];
  }, [isAnnee, year, glissantWeeks, currentISOYear]);

  const { data: eventsA = [] } = usePlanningAnnee(fetchA);
  const { data: eventsB = [] } = usePlanningAnnee(fetchB);
  const { data: baselineEvents = [] } = usePlanningAnnee(currentISOYear);
  const events = useMemo(() => {
    if (fetchA === fetchB) return eventsA;
    const seen = new Set(eventsA.map((e) => e.id_ordre_travail));
    return [...eventsA, ...eventsB.filter((e) => !seen.has(e.id_ordre_travail))];
  }, [eventsA, eventsB, fetchA, fetchB]);
  const { data: modalOts = [] } = useOtByIds(selectedIds);

  // ── Familles + cellLookup ──

  const allFamilies = useMemo(() => {
    const set = new Set<string>();
    for (const ot of baselineEvents) set.add(ot.nom_famille ?? "Sans famille");
    for (const ot of events) set.add(ot.nom_famille ?? "Sans famille");
    return Array.from(set).sort((a, b) => a.localeCompare(b));
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
    let list = allFamilies;
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

  const monthHeaders = useMemo(
    () => isAnnee ? buildYearMonthHeaders(year) : buildWeeksMonthHeaders(glissantWeeks),
    [isAnnee, year, glissantWeeks],
  );

  // ── Scroll sync (mode Année) ──

  const syncScroll = useCallback(() => {
    if (contentRef.current && headerRef.current) headerRef.current.scrollLeft = contentRef.current.scrollLeft;
  }, []);

  useEffect(() => {
    if (!isAnnee) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = contentRef.current;
      if (!el) return;
      const target = Math.max(0, (currentWeek - 1) * CELL_STEP - el.clientWidth / 2);
      el.scrollLeft = target;
      if (headerRef.current) headerRef.current.scrollLeft = target;
    }));
  }, [isAnnee, year, currentWeek]);

  // ── Navigation ──

  const goForward = () => { isAnnee ? setYear((y) => y + 1) : setWeekOffset((o) => o + 13); };
  const goBack = () => { isAnnee ? setYear((y) => y - 1) : setWeekOffset((o) => o - 13); };
  const goToday = () => {
    if (isAnnee) {
      setYear(currentISOYear);
      requestAnimationFrame(() => {
        const el = contentRef.current;
        if (!el) return;
        el.scrollTo({ left: Math.max(0, (currentWeek - 1) * CELL_STEP - el.clientWidth / 2), behavior: "smooth" });
      });
    } else { setWeekOffset(0); }
  };

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

  // Hover via refs + DOM direct — évite le re-render de 500+ cellules
  const applyHover = useCallback((weekKey: string | null, family: string | null) => {
    const content = contentRef.current;
    if (!content) return;
    const prevWeek = hoverWeekRef.current;
    const prevFamily = hoverFamilyRef.current;
    if (prevWeek === weekKey && prevFamily === family) return;

    if (prevWeek) content.querySelectorAll(`[data-week="${prevWeek}"]`).forEach((el) => el.classList.remove("col-hover"));
    if (prevFamily) content.querySelectorAll(`[data-family="${prevFamily}"]`).forEach((el) => el.classList.remove("row-hover"));
    if (weekKey) content.querySelectorAll(`[data-week="${weekKey}"]`).forEach((el) => el.classList.add("col-hover"));
    if (family) content.querySelectorAll(`[data-family="${family}"]`).forEach((el) => el.classList.add("row-hover"));

    hoverWeekRef.current = weekKey;
    hoverFamilyRef.current = family;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest("[data-week]") as HTMLElement | null;
    if (target) applyHover(target.dataset.week!, target.dataset.family!);
  }, [applyHover]);

  const handleMouseLeave = useCallback(() => applyHover(null, null), [applyHover]);

  // ── Dimensions ──

  const weekCount = displayWeeks.length;
  const totalWeeksWidth = weekCount * CELL_SIZE;
  const totalWidth = LABEL_COL + totalWeeksWidth;
  const weeksCols = `repeat(${weekCount}, ${CELL_SIZE}px)`;

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <style>{`.col-hover { background-color: hsl(var(--muted)) !important; } .row-hover { background-color: hsl(var(--foreground) / 0.03) !important; }`}</style>
      <PageHeader title="Planning" />

      <div ref={containerRef} className="flex flex-1 flex-col rounded-md border min-h-0 min-w-0 overflow-hidden">
        <TooltipProvider delay={300}>
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-background shrink-0 sticky top-0 z-50">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrer..."
                className="h-8 w-36 pl-7 text-xs" />
            </div>
            <HeaderButton icon={<Focus className="size-4" />} label="Focus 12 semaines"
              onClick={() => setFocused((f) => !f)} variant={focused ? "default" : "outline"} />
            <div className="flex-1" />
            <HeaderButton icon={<ChevronsLeft className="size-4" />}
              label={isAnnee ? "Année précédente" : "Trimestre précédent"} onClick={goBack} />
            <button type="button" onClick={goToday}
              className="text-sm font-bold tabular-nums min-w-40 text-center hover:text-primary transition-colors cursor-pointer">
              {periodLabel}
            </button>
            <HeaderButton icon={<ChevronsRight className="size-4" />}
              label={isAnnee ? "Année suivante" : "Trimestre suivant"} onClick={goForward} />
          </div>
        </TooltipProvider>

        <div className="flex shrink-0 border-b bg-background sticky top-0 z-20">
          <div className="shrink-0 border-r flex overflow-hidden z-40 bg-background" style={{ width: LABEL_COL }}>
            {(["glissant", "annee"] as const).map((m, i) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={cn("flex-1 text-[10px] font-medium tracking-wide uppercase transition-all",
                  i > 0 && "border-l",
                  mode === m ? "bg-muted text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30",
                )}>{m === "glissant" ? "Glissant" : "Année"}</button>
            ))}
          </div>
          <div ref={headerRef} className="flex-1 overflow-hidden min-w-0">
            <div style={{ width: totalWeeksWidth }}>
              <div className="grid" style={{ gridTemplateColumns: weeksCols }}>
                {monthHeaders.map((m, i) => (
                  <div key={`m-${i}`} className="text-center text-[10px] font-semibold text-muted-foreground border-r py-1"
                    style={{ gridColumn: `span ${m.span}` }}>{m.label}</div>
                ))}
              </div>
              <div className="grid" style={{ gridTemplateColumns: weeksCols }}>
                {displayWeeks.map((w) => (
                  <div key={w.key} className={cn("text-center text-[8px] py-0.5",
                    w.key === currentWeekKey ? "text-primary font-bold border-x-2 border-x-blue-500 bg-primary/10" : "text-muted-foreground/50 border-r",
                  )}>{w.week}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div ref={contentRef}
          className={cn("flex-1 min-h-0", isAnnee ? "overflow-auto" : "overflow-y-auto overflow-x-hidden")}
          onScroll={isAnnee ? syncScroll : undefined}
          onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
          <div className="flex" style={{ width: isAnnee ? totalWidth : undefined }}>
            <div className={cn("shrink-0 border-r bg-background", isAnnee && "sticky left-0 z-30 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]")}
              style={{ width: LABEL_COL }}>
              {displayedFamilies.map((f) => (
                <div key={f} data-family={f} className="px-2 flex items-center overflow-hidden border-b" style={{ height: CELL_SIZE }}>
                  <span className="text-[10px] font-semibold truncate">{f}</span>
                </div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: weeksCols, gridAutoRows: CELL_SIZE }}>
              {displayedFamilies.flatMap((famille) =>
                displayWeeks.map((w) => {
                  const cell = cellLookup.get(famille)?.get(w.key);
                  const isCurr = w.key === currentWeekKey;
                  if (!cell) {
                    return (
                      <div key={`${famille}-${w.key}`} data-week={w.key} data-family={famille}
                        className={cn("border-b border-r", isCurr && "border-x-2 border-x-blue-500")} />
                    );
                  }
                  const priority = getCellPriority(cell.events, todayStr, currentWeek, currentISOYear, w);
                  return (
                    <div key={`${famille}-${w.key}`} data-week={w.key} data-family={famille}
                      onClick={() => handleCellClick(cell)}
                      className={cn("flex items-center justify-center border-b cursor-pointer hover:opacity-80 transition-opacity",
                        priorityColor(priority),
                        cell.reglementaire && "ring-[3px] ring-inset ring-yellow-400",
                        isCurr && "border-x-2 border-x-blue-500",
                      )}>
                      {cell.events.length > 1 && <span className="text-[9px] font-bold text-white drop-shadow-sm">{cell.events.length}</span>}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
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
