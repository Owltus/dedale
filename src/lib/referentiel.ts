import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

type TableName = keyof Database['public']['Tables']

/**
 * Query « référentiel » standard : petite table de codes globale et peu
 * mouvante (statuts, rôles, périodicités, unités…), lue en entier. Factorise
 * le patron répété dans les features : `queryKey` `[table, 'list']`, `select`
 * + `order` + `throwOnError`, fraîcheur 5 min.
 *
 * `select` et `orderBy` doivent être des LITTÉRAUX au call-site : supabase-js
 * en infère le type des lignes (ex. `Pick<Row, 'id' | 'nom'>[]`).
 */
export function referentielQueryOptions<
  T extends TableName,
  // `S` capture le LITTÉRAL du select (pas `string`) : c'est lui que supabase-js
  // parse au niveau des types pour inférer les colonnes retournées — sans lui,
  // `data` dégénère en type d'erreur. Générique en apparence « inutile » (utilisé
  // une fois), mais porteur de toute l'inférence du retour.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  S extends string,
>(table: T, select: S, orderBy: string) {
  return queryOptions({
    queryKey: [table, 'list'] as const,
    queryFn: async ({ signal }) => {
      const { data } = await supabase
        .from(table)
        .select(select)
        .order(orderBy)
        .abortSignal(signal)
        .throwOnError()
      return data
    },
    staleTime: 5 * 60_000,
  })
}
