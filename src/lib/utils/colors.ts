/**
 * Palette HSL partagée des graphiques OT (Dashboard + Planning).
 * Indexée par priorité 1-7 telle que calculée par getOtPriority (pages/planning/helpers.ts).
 *
 *  1 Rouge    — En retard
 *  2 Orange   — Réouvert
 *  3 Bleu     — En cours
 *  4 Émeraude — Clôturé
 *  5 Ocre     — Annulé
 *  6 Violet   — Planifié manuellement
 *  7 Gris     — Programmé automatiquement
 */
export const OT_PRIORITY_FILL: Record<number, string> = {
  1: "hsl(0, 65%, 50%)",
  2: "hsl(30, 75%, 52%)",
  3: "hsl(215, 70%, 52%)",
  4: "hsl(150, 65%, 42%)",
  5: "hsl(50, 70%, 48%)",
  6: "hsl(265, 65%, 55%)",
  7: "hsl(215, 20%, 55%)",
};

/**
 * Mêmes teintes, indexées par id_statut OT (table types_statuts_ot).
 *  1 Planifié   → priorité 6
 *  2 En cours   → priorité 3
 *  3 Clôturé    → priorité 4
 *  4 Annulé     → priorité 5
 *  5 Réouvert   → priorité 2
 *  11 Programmé → priorité 7
 */
export const OT_STATUT_FILL: Record<number, string> = {
  1: OT_PRIORITY_FILL[6]!,
  2: OT_PRIORITY_FILL[3]!,
  3: OT_PRIORITY_FILL[4]!,
  4: OT_PRIORITY_FILL[5]!,
  5: OT_PRIORITY_FILL[2]!,
  11: OT_PRIORITY_FILL[7]!,
};
