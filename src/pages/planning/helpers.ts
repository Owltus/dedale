import type { PlanningEvent } from "@/lib/types/dashboard";

// ── Semaines ISO 8601 (norme FR) ──

export function getISOWeekDate(date: Date): { isoYear: number; isoWeek: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { isoYear, isoWeek };
}

export function getISOWeeksInYear(year: number): number {
  const jan1Day = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const dec31Day = new Date(Date.UTC(year, 11, 31)).getUTCDay();
  return (jan1Day === 4 || dec31Day === 4) ? 53 : 52;
}

export function getMondayOfISOWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const w1Monday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  w1Monday.setUTCDate(w1Monday.getUTCDate() + (week - 1) * 7);
  return w1Monday;
}

// ── Semaine info ──

export interface WeekInfo {
  year: number;
  week: number;
  key: string;
}

export function dateToWeekInfo(dateStr: string): WeekInfo {
  const [y, m, d] = dateStr.split("-").map(Number);
  const { isoYear, isoWeek } = getISOWeekDate(new Date(y!, m! - 1, d!));
  return { year: isoYear, week: isoWeek, key: `${isoYear}-${isoWeek}` };
}

export function getEffectiveDate(ot: PlanningEvent): string {
  return ot.date_cloture ?? ot.date_debut ?? ot.date_prevue;
}

// ── En-têtes mois ──

const MONTH_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

export function buildYearMonthHeaders(year: number): Array<{ label: string; span: number }> {
  const totalWeeks = getISOWeeksInYear(year);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const w1Monday = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
  const headers: Array<{ label: string; span: number }> = [];
  let prevMonth = -1;
  for (let w = 1; w <= totalWeeks; w++) {
    const thursday = new Date(w1Monday);
    thursday.setUTCDate(thursday.getUTCDate() + (w - 1) * 7 + 3);
    const month = thursday.getUTCMonth();
    if (month !== prevMonth) {
      headers.push({ label: MONTH_LABELS[month]!, span: 1 });
      prevMonth = month;
    } else {
      headers[headers.length - 1]!.span++;
    }
  }
  return headers;
}

export function buildWeeksMonthHeaders(weeks: WeekInfo[]): Array<{ label: string; span: number }> {
  const headers: Array<{ label: string; span: number }> = [];
  let prevKey = "";
  for (const w of weeks) {
    const monday = getMondayOfISOWeek(w.year, w.week);
    const thursday = new Date(monday);
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    const month = thursday.getUTCMonth();
    const key = `${thursday.getUTCFullYear()}-${month}`;
    if (key !== prevKey) {
      headers.push({ label: MONTH_LABELS[month]!, span: 1 });
      prevKey = key;
    } else {
      headers[headers.length - 1]!.span++;
    }
  }
  return headers;
}

export function computeGlissantWeeks(
  currentYear: number, currentWeek: number, weekOffset: number, count: number,
): WeekInfo[] {
  const currentMonday = getMondayOfISOWeek(currentYear, currentWeek);
  const halfVisible = Math.floor(count / 2);
  const startDate = new Date(currentMonday);
  startDate.setUTCDate(startDate.getUTCDate() + (weekOffset - halfVisible) * 7);

  const result: WeekInfo[] = [];
  for (let i = 0; i < count; i++) {
    const thursday = new Date(startDate);
    thursday.setUTCDate(thursday.getUTCDate() + i * 7 + 3);
    const { isoYear, isoWeek } = getISOWeekDate(thursday);
    result.push({ year: isoYear, week: isoWeek, key: `${isoYear}-${isoWeek}` });
  }
  return result;
}

// ── Statuts OT ──

const STATUT_PLANIFIE = 1;
const STATUT_EN_COURS = 2;
const STATUT_CLOTURE = 3;
const STATUT_REOUVERT = 5;
const NEAR_FUTURE_WEEKS = 4;

// ── Couleurs par priorité (PRD) ──

const PRIORITY_COLORS = [
  "",
  "bg-red-500",     // 1 — Retard ou réouvert
  "bg-cyan-500",    // 2 — En cours
  "bg-yellow-500",  // 3 — Cette semaine
  "bg-orange-400",  // 4 — Prochaines semaines
  "bg-green-500",   // 5 — Clôturé
  "bg-slate-400",   // 6 — Programmé / planifié lointain
];

export function getOtPriority(
  ot: PlanningEvent, todayStr: string, currentWeek: number, currentYear: number, weekInfo: WeekInfo,
): number {
  if (ot.id_statut_ot === STATUT_REOUVERT) return 1;
  const isLate = ot.date_prevue < todayStr && [STATUT_PLANIFIE, STATUT_EN_COURS].includes(ot.id_statut_ot);
  if (isLate) return 1;
  if (ot.id_statut_ot === STATUT_EN_COURS) return 2;
  if (ot.id_statut_ot === STATUT_PLANIFIE) {
    if (weekInfo.year === currentYear && weekInfo.week === currentWeek) return 3;
    // Différence absolue en semaines pour gérer le croisement d'années
    const weekDiff = (weekInfo.year - currentYear) * 52 + weekInfo.week - currentWeek;
    if (weekDiff > 0 && weekDiff <= NEAR_FUTURE_WEEKS) return 4;
  }
  if (ot.id_statut_ot === STATUT_CLOTURE) return 5;
  return 6;
}

export function priorityColor(priority: number): string {
  return PRIORITY_COLORS[priority] ?? "bg-slate-400";
}

export function getCellPriority(
  events: PlanningEvent[], todayStr: string, currentWeek: number, currentYear: number, weekInfo: WeekInfo,
): number {
  let best = 7;
  for (const ot of events) {
    const p = getOtPriority(ot, todayStr, currentWeek, currentYear, weekInfo);
    if (p < best) best = p;
  }
  return best;
}

// ── Cell data ──

export interface CellData {
  events: PlanningEvent[];
  reglementaire: boolean;
}

export const CELL_SIZE = 24;
export const CELL_STEP = CELL_SIZE + 1; // cellule + 1px bordure
export const LABEL_COL = 160;
const SAFETY_MARGIN = 30;
const MIN_VISIBLE = 10;
const MAX_VISIBLE = 52;

export function computeVisibleWeeks(containerWidth: number): number {
  return Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, Math.floor((containerWidth - LABEL_COL - SAFETY_MARGIN) / CELL_STEP)));
}
