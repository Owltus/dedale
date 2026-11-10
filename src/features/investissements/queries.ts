import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export const investissementsQueries = {
  all: () => ['investissements'] as const,

  /** Investissements du site actif (toutes années), plus récents d'abord. */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...investissementsQueries.all(), 'list', siteId] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('investissements')
          .select('*')
          .eq('site_id', siteId)
          .order('date_demande', { ascending: false })
          .throwOnError()
        return data
      },
    }),

  /**
   * Investissements d'UNE année de budget (138) : même cache que `list`, filtré
   * à la lecture. La liste de l'année ET la fiche résolvent leur adresse sur
   * ce même ensemble (symétrie de `segOfUnique`).
   */
  parAnnee: (siteId: string, annee: number) => ({
    ...investissementsQueries.list(siteId),
    select: (data: Investissement[]) =>
      data.filter((i) => i.annee_budget === annee),
  }),
}

/**
 * Journal des décisions d'un dossier (138) : seules les dates de validation et
 * de report en sont tirées. Sous la clé `investissements` : toute mutation du
 * dossier le rafraîchit.
 */
export const decisionsCapexQueries = {
  list: (investissementId: string) =>
    queryOptions({
      queryKey: [
        ...investissementsQueries.all(),
        'decisions',
        investissementId,
      ] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('investissements_decisions')
          .select('statut_capex_id, annee_budget, created_at')
          .eq('investissement_id', investissementId)
          .order('created_at', { ascending: true })
          .throwOnError()
        return data
      },
    }),
}

export const statutsCapexQueries = {
  /** Référentiel des statuts CapEx (statut libre, pas de machine à états). */
  list: () => referentielQueryOptions('statuts_capex', 'id, nom', 'nom'),
}
