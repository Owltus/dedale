/// Trois manières de représenter une mesure dans le temps :
/// - `bar-delta` : compteur cumulatif → on affiche les Δ entre relevés (la consommation par période).
/// - `bar-raw`   : valeur instantanée discrète (puissance, intensité) → barre verticale par relevé.
/// - `line`      : mesure continue (température, concentration, pression) → courbe d'évolution.
export type ChartKind = "line" | "bar-delta" | "bar-raw";

/// Unités dont les valeurs sont par nature un index cumulatif (énergies, volumes, durées).
/// Sert de fallback quand on n'a pas assez de données pour inférer la monotonie.
const CUMULATIVE_SYMBOLS = new Set([
  "m³", "L", "hL", "mL",                        // volumes
  "kWh", "MWh", "GWh", "Wh", "GJ", "MJ", "kJ",  // énergies
  "h", "min", "s",                              // durées de fonctionnement
]);

/// Unités de puissance / intensité électrique : valeur instantanée à un moment T,
/// affichée en barres comparatives plutôt qu'en courbe (convention métier énergie).
const POWER_INSTANT_SYMBOLS = new Set([
  "kVA", "VA", "MVA",        // puissances apparentes
  "kW", "W", "MW",           // puissances actives
  "kV", "V", "mV",           // tensions
  "A", "mA", "kA",           // intensités
]);

/**
 * Choisit le type de graphique adapté à une opération mesure :
 * 1. Si les valeurs sont monotones croissantes (≥ 3 points) → cumulatif → `bar-delta`
 * 2. Sinon, si le symbole est une puissance/intensité → `bar-raw`
 * 3. Sinon, si le symbole est connu cumulatif (fallback peu de données) → `bar-delta`
 * 4. Sinon → `line` (mesure continue : température, concentration, pression…)
 */
export function inferChartKind(
  values: number[],
  symbole: string | null | undefined,
): ChartKind {
  if (values.length >= 3 && isMonotoneIncreasing(values)) return "bar-delta";
  if (symbole && POWER_INSTANT_SYMBOLS.has(symbole)) return "bar-raw";
  if (symbole && CUMULATIVE_SYMBOLS.has(symbole)) return "bar-delta";
  return "line";
}

/// Seuil de Δ ≥ 0 acceptés pour considérer une série comme monotone croissante (= compteur).
/// 0.85 = 85 % : tolère ~1 changement de compteur isolé sur une douzaine de relevés.
const MONOTONE_THRESHOLD = 0.85;

/// True si la série est croissante en tolérant un nombre limité de Δ négatifs
/// (= changements de compteur isolés). Conçu pour distinguer un compteur (toujours ↗)
/// d'une mesure instantanée (oscille).
function isMonotoneIncreasing(values: number[]): boolean {
  if (values.length < 2) return false;
  let positifsOrEqual = 0;
  let negatifs = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = values[i]! - values[i - 1]!;
    if (delta >= 0) positifsOrEqual++;
    else negatifs++;
  }
  const total = positifsOrEqual + negatifs;
  return positifsOrEqual / total >= MONOTONE_THRESHOLD;
}

/// Compatibilité MesureCell : true si l'opération est traitée comme un compteur cumulatif.
export function isCounterUnit(values: number[], symbole: string | null | undefined): boolean {
  return inferChartKind(values, symbole) === "bar-delta";
}
