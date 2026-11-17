// Briques partagées par les outils de lecture (outils.ts) et d'écriture
// (outils-ecriture.ts) du connecteur Claude.

import { z } from 'npm:zod@3.23.8'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export type Contexte = { supabase: SupabaseClient; userId: string }
export type Resultat = { content: { type: 'text'; text: string }[]; isError?: boolean }
export type Outil = {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  annotations: Record<string, unknown>
  schema: z.ZodTypeAny
  run: (args: never, ctx: Contexte) => Promise<unknown>
}

/** Erreur dont le message est destiné tel quel à la personne. */
export class ErreurOutil extends Error {}

/** Date réelle « AAAA-MM-JJ » : refuse 2026-02-30 ou 2026-13-01 (162). */
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s)
  }, 'Cette date n’existe pas')

/** « 18/11/2026 (S47) » — semaine ISO 8601, comme partout dans Dédale. */
export function dateFr(iso: string | null | undefined): string | null {
  if (!iso) return null
  const [a, m, j] = iso.slice(0, 10).split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, j))
  const jour = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - jour + 3)
  const premierJeudi = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  const semaine = 1 + Math.round(((d.getTime() - premierJeudi.getTime()) / 86400000 - 3 + ((premierJeudi.getUTCDay() + 6) % 7)) / 7)
  return `${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a} (S${semaine})`
}

// ─── Écriture : aperçu puis code (158, 159) ──────────────────────────────────

export const ECRITURE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
export const ECRITURE_SENSIBLE = { ...ECRITURE, destructiveHint: true }

export const uuid = z.string().uuid('Identifiant invalide')
export const appliquer = z.boolean().default(false)
export const code = z.string().regex(/^[0-9A-Fa-f]{8}$/, 'Code de confirmation : 8 caractères, donné par l’aperçu').optional()

export const PROPRIETES_CONFIRMATION = {
  appliquer: { type: 'boolean', default: false, description: 'false (défaut) = APERÇU, rien n’est enregistré. true = enregistrer, seulement après un oui explicite de la personne sur l’aperçu.' },
  code: { type: 'string', description: 'Code de confirmation rendu par l’aperçu (obligatoire avec appliquer=true).' },
}

export const CLES_DATE = new Set(['date', 'date_prevue', 'debut', 'cloture', 'date_constat', 'date_resolution'])

/** Remplace les dates ISO des champs connus par « JJ/MM/AAAA (Sxx) ». */
export function datesEnFrancais(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(datesEnFrancais)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        CLES_DATE.has(k) && typeof x === 'string' ? dateFr(x) : datesEnFrancais(x),
      ]),
    )
  }
  return v
}

/** Appelle une fonction claude_* et rend un résultat prêt à montrer. */
export async function geste(ctx: Contexte, fonction: string, params: Record<string, unknown>, appliquerDemande: boolean, apres: string) {
  const { data, error } = await ctx.supabase.rpc(fonction, params)
  // Les messages viennent de la base (fonctions 158-159, triggers) : en français,
  // destinés à la personne.
  if (error) {
    // 162 : seuls les messages écrits pour la personne (RAISE des fonctions
    // claude_* = P0001, refus de droit = 42501) sont relayés. Le reste
    // (contraintes, syntaxe, PostgREST) reste dans les journaux.
    if (error.code === 'P0001' || error.code === '42501') throw new ErreurOutil(`Rien n’a été enregistré. ${error.message}`)
    console.error(fonction, error)
    throw new ErreurOutil('Rien n’a été enregistré : Dédale a refusé ces valeurs (format ou cohérence). Relis la fiche ou l’OT, puis refais l’aperçu.')
  }
  const resultat = datesEnFrancais(data) as Record<string, unknown>
  return {
    ...resultat,
    consigne: appliquerDemande
      ? `C’est enregistré. ${apres}`
      : `APERÇU SEULEMENT. Montre ce récapitulatif à la personne et attends un oui explicite. Ensuite seulement, rappelle cet outil avec EXACTEMENT les mêmes paramètres, appliquer=true et code=${String(resultat.code_confirmation)}.`,
  }
}

