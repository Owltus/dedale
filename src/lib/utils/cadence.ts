/// Plage de jalons et utilitaires de date pour les graphiques temporels.
/// Toutes les fonctions travaillent en **UTC explicite** : passer par les helpers
/// locaux (`new Date(iso)`, `setDate`, etc.) introduit des décalages d'1 jour sur
/// les fuseaux non-UTC (Paris UTC+1/+2) qui produisaient des jalons "2026-03-31"
/// au lieu de "2026-04-01".

const SAFETY_MAX_JALONS = 500;

export type CadenceUnit = "week" | "month" | "quarter" | "year";

export interface Cadence {
  unit: CadenceUnit;
  count: number;
}

/// Cadence "naturelle" alignée sur le calendrier pour une périodicité donnée.
/// Garantit des jalons sur des dates parlantes (lundis, 1er du mois, etc.).
export function getNaturalCadence(joursPeriodicite: number): Cadence {
  if (joursPeriodicite <= 7) return { unit: "week", count: 1 };
  if (joursPeriodicite <= 14) return { unit: "week", count: 2 };
  if (joursPeriodicite <= 31) return { unit: "month", count: 1 };
  if (joursPeriodicite <= 60) return { unit: "month", count: 2 };
  if (joursPeriodicite <= 90) return { unit: "quarter", count: 1 };
  if (joursPeriodicite <= 180) return { unit: "month", count: 6 };
  if (joursPeriodicite <= 365) return { unit: "year", count: 1 };
  return { unit: "year", count: Math.max(1, Math.round(joursPeriodicite / 365)) };
}

/// Aligne une date ISO sur le début de l'unité de cadence (lundi, 1er du mois, etc.).
export function alignToCadence(iso: string, cadence: Cadence): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const dateUTC = new Date(Date.UTC(y!, m! - 1, d!));
  if (cadence.unit === "week") {
    const weekday = dateUTC.getUTCDay(); // 0 = dim, 1 = lun, ..., 6 = sam
    const offset = weekday === 0 ? -6 : 1 - weekday; // recule jusqu'au lundi précédent
    const aligned = new Date(dateUTC);
    aligned.setUTCDate(aligned.getUTCDate() + offset);
    return aligned;
  }
  if (cadence.unit === "month") return new Date(Date.UTC(y!, m! - 1, 1));
  if (cadence.unit === "quarter") {
    const q = Math.floor((m! - 1) / 3);
    return new Date(Date.UTC(y!, q * 3, 1));
  }
  return new Date(Date.UTC(y!, 0, 1));
}

/// Avance d'une cadence (count × unit) en UTC.
export function advanceCadence(d: Date, cadence: Cadence): Date {
  const result = new Date(d);
  if (cadence.unit === "week") {
    result.setUTCDate(result.getUTCDate() + 7 * cadence.count);
  } else if (cadence.unit === "month") {
    result.setUTCMonth(result.getUTCMonth() + cadence.count);
  } else if (cadence.unit === "quarter") {
    result.setUTCMonth(result.getUTCMonth() + 3 * cadence.count);
  } else {
    result.setUTCFullYear(result.getUTCFullYear() + cadence.count);
  }
  return result;
}

/// Ajoute N jours (positifs ou négatifs) à une date ISO YYYY-MM-DD.
/// Travaille en UTC pour éviter tout décalage de timezone.
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Génère des dates jalons alignées sur le calendrier (lundis, 1er du mois, etc.)
 * dans `[startIso, endIso]`, à la cadence naturelle de la périodicité.
 *
 * Le 1er jalon est toujours **avant ou égal** à `startIso` (et non pas le 1er ≥ startIso),
 * pour garantir qu'un Δ dont la médiane tombe juste après `startIso` trouve un bucket.
 */
export function buildJalons(startIso: string, endIso: string, joursPeriodicite: number): string[] {
  if (joursPeriodicite <= 0) return [];
  const cadence = getNaturalCadence(joursPeriodicite);
  const jalons: string[] = [];
  let current = alignToCadence(startIso, cadence);
  let safety = 0;
  while (current.toISOString().slice(0, 10) <= endIso && safety < SAFETY_MAX_JALONS) {
    jalons.push(current.toISOString().slice(0, 10));
    current = advanceCadence(current, cadence);
    safety++;
  }
  return jalons;
}

/// Retourne le plus grand jalon ≤ `dateIso` (= jalon « contenant » la date).
/// Suppose `jalonsTimes` trié ASC et de même longueur que `jalons`.
/// Retourne `null` si la date est antérieure à tous les jalons.
export function findContainingJalon(
  dateIso: string,
  jalonsTimes: number[],
  jalons: string[],
): string | null {
  if (jalonsTimes.length === 0) return null;
  const target = new Date(dateIso).getTime();
  let bestIdx = -1;
  for (let i = 0; i < jalonsTimes.length; i++) {
    if (jalonsTimes[i]! <= target) bestIdx = i;
    else break;
  }
  return bestIdx === -1 ? null : jalons[bestIdx]!;
}
