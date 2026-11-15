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

export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format AAAA-MM-JJ')

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
