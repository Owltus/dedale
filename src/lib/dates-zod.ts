import { z } from 'zod'

/**
 * Dates NUES (`YYYY-MM-DD`) dans les schémas Zod.
 *
 * Toutes les colonnes DATE du projet sont saisies en date nue locale (jamais
 * `toISOString()`, cf. `lib/date`). Les schémas les déclaraient jusqu'ici en
 * `z.string().min(1)` : n'importe quel texte passait, et Postgres répondait
 * `22007` (invalid_datetime_format) en brut. Pire, les `refine` de cohérence
 * (« la clôture ne précède pas la demande ») comparaient des chaînes
 * quelconques — une comparaison lexicographique ne garantit l'ordre des dates
 * que si les deux opérandes sont déjà au format `YYYY-MM-DD`.
 *
 * Portée réelle : à l'écran, la saisie passe toujours par le calendrier
 * (`ui/date-field.tsx`), qui ne produit que `YYYY-MM-DD` ou `''` — un
 * utilisateur au clavier ne PEUT pas produire une date malformée. Ce contrôle
 * protège donc les appels programmatiques, les imports et les `defaultValues`
 * mal formés, et il rend les comparaisons ci-dessus fiables.
 *
 * Le message est maison : celui de Zod est en anglais et parle d'ISO 8601,
 * illisible dans une application française où le calendrier affiche
 * `jj/mm/aaaa`.
 */

const FORMAT_DATE_NUE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Message unique de format, volontairement tourné vers le geste à faire. */
export const MESSAGE_DATE_INVALIDE =
  'Date invalide : choisissez une date dans le calendrier (jj/mm/aaaa).'

const JOURS_PAR_MOIS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/**
 * `true` si la chaîne est une date nue `YYYY-MM-DD` **réelle** (le calendrier
 * est vérifié : ni `2026-13-45`, ni `2026-02-30`, que Postgres refuserait aussi).
 * Le calcul se fait à la main plutôt que via `new Date(...)`, qui reporte
 * silencieusement les débordements (31/02 → 03/03) et remappe les années 0 à 99.
 */
export function estDateNue(valeur: string): boolean {
  const trouve = FORMAT_DATE_NUE.exec(valeur)
  if (!trouve) return false
  const annee = Number(trouve[1])
  const mois = Number(trouve[2])
  const jour = Number(trouve[3])
  if (mois < 1 || mois > 12) return false
  const maxJours =
    mois === 2 && estBissextile(annee) ? 29 : JOURS_PAR_MOIS[mois - 1]
  return jour >= 1 && jour <= (maxJours ?? 31)
}

/**
 * Champ date OBLIGATOIRE : refuse le vide (avec le message métier fourni, qui
 * dit DE QUELLE date il s'agit) puis le format.
 */
export function dateObligatoire(messageVide: string): z.ZodString {
  return z
    .string()
    .min(1, messageVide)
    .refine(estDateNue, MESSAGE_DATE_INVALIDE)
}

/**
 * Champ date FACULTATIF : `''` = « non renseignée » (convention du projet —
 * les formulaires ne manipulent jamais `null`, la mutation convertit).
 */
export function dateFacultative(): z.ZodString {
  return z
    .string()
    .refine((v) => v === '' || estDateNue(v), MESSAGE_DATE_INVALIDE)
}
