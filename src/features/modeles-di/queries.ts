import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ModeleDi = Database['public']['Tables']['modeles_di']['Row']

export const modelesDiQueries = {
  all: () => ['modeles_di'] as const,

  /**
   * Tous les modèles de DI accessibles via la RLS (communs + tous les sites de
   * l'utilisateur). Catalogue commun + site → le périmètre (Tout / Commun /
   * site) est appliqué côté composant.
   */
  pool: () =>
    queryOptions({
      queryKey: [...modelesDiQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_di')
          .select('*')
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),
}
