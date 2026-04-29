/// Symboles d'unités traités comme des compteurs cumulatifs : la valeur brute
/// est un index — la mesure pertinente est la consommation depuis le précédent relevé.
const COUNTER_SYMBOLS = new Set(["m³", "kWh", "h", "kVA"]);

export function isCounterUnit(symbole: string | null | undefined): boolean {
  return !!symbole && COUNTER_SYMBOLS.has(symbole);
}
