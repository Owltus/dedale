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

const MONTH_SHORT = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
const MONTH_FULL = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** Label mois adapté à la place disponible */
export function monthLabel(monthIndex: number, span: number): string {
  if (span >= 4) return MONTH_FULL[monthIndex]!;
  if (span >= 2) return MONTH_SHORT[monthIndex]!;
  return MONTH_SHORT[monthIndex]!.charAt(0);
}

/** Label année adapté à la place disponible */
export function yearLabel(year: number, span: number): string {
  if (span >= 3) return String(year);
  return String(year).slice(-2);
}

export interface HeaderSpan {
  value: number; // année ou index mois
  span: number;
}

/** En-têtes années pour une liste de semaines */
export function buildWeeksYearHeaders(weeks: WeekInfo[]): Array<HeaderSpan> {
  const headers: Array<HeaderSpan> = [];
  let prev = -1;
  for (const w of weeks) {
    if (w.year !== prev) { headers.push({ value: w.year, span: 1 }); prev = w.year; }
    else { headers[headers.length - 1]!.span++; }
  }
  return headers;
}

/** En-têtes mois pour une liste de semaines */
export function buildWeeksMonthHeaders(weeks: WeekInfo[]): Array<HeaderSpan> {
  const headers: Array<HeaderSpan> = [];
  let prevKey = "";
  for (const w of weeks) {
    const monday = getMondayOfISOWeek(w.year, w.week);
    const thursday = new Date(monday);
    thursday.setUTCDate(thursday.getUTCDate() + 3);
    const month = thursday.getUTCMonth();
    const key = `${thursday.getUTCFullYear()}-${month}`;
    if (key !== prevKey) { headers.push({ value: month, span: 1 }); prevKey = key; }
    else { headers[headers.length - 1]!.span++; }
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
const STATUT_ANNULE = 4;
const STATUT_REOUVERT = 5;

// ── Couleurs par priorité (alignées sur statuts.ts) ──
// 1 Rouge  — En retard (date dépassée)
// 2 Orange — Réouvert (cohérent badge orange)
// 3 Bleu   — En cours (cohérent badge bleu)
// 4 Vert   — Clôturé (cohérent badge vert)
// 5 Jaune  — Annulé (cohérent badge jaune)
// 6 Violet — Planifié manuellement (cohérent badge violet)
// 7 Gris   — Programmé automatiquement (cohérent badge outline)

const PRIORITY_COLORS = [
  "",
  "bg-red-500",     // 1 — En retard
  "bg-orange-500",  // 2 — Réouvert
  "bg-blue-500",    // 3 — En cours
  "bg-green-500",   // 4 — Clôturé
  "bg-yellow-500",  // 5 — Annulé
  "bg-violet-500",  // 6 — Planifié
  "bg-slate-400",   // 7 — Programmé
];

export function getOtPriority(
  ot: PlanningEvent, weekStartStr: string,
): number {
  // En retard = semaine ISO de l'OT strictement passée (on a toute la semaine pour intervenir)
  const isLate = ot.date_prevue < weekStartStr && [STATUT_PLANIFIE, STATUT_EN_COURS].includes(ot.id_statut_ot);
  if (isLate) return 1;
  if (ot.id_statut_ot === STATUT_REOUVERT) return 2;
  if (ot.id_statut_ot === STATUT_EN_COURS) return 3;
  if (ot.id_statut_ot === STATUT_CLOTURE) return 4;
  if (ot.id_statut_ot === STATUT_ANNULE) return 5;
  if (ot.id_statut_ot === STATUT_PLANIFIE) {
    return ot.est_automatique ? 7 : 6;
  }
  return 7;
}

export function priorityColor(priority: number): string {
  return PRIORITY_COLORS[priority] ?? "bg-slate-400";
}

export function getCellPriority(events: PlanningEvent[], weekStartStr: string): number {
  let best = 8;
  for (const ot of events) {
    const p = getOtPriority(ot, weekStartStr);
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
const LABEL_COL = 160;
const MIN_VISIBLE = 10;
const MAX_VISIBLE = 156; // ~3 ans sur écran très large

/** Nombre de cellules 24×24 complètes qui tiennent */
export function computeVisibleWeeks(containerWidth: number): number {
  const available = containerWidth - LABEL_COL;
  return Math.min(MAX_VISIBLE, Math.max(MIN_VISIBLE, Math.floor(available / CELL_SIZE)));
}
