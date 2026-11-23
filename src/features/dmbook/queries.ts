import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

/**
 * Connexions Dmbook des sites que la personne peut régler (migration 165, D18-D19),
 * via `dmbook_connexions_public()`. La base ne répond qu'aux admin / manager /
 * technicien du site : pour les autres, la liste est vide. Ni identifiant en
 * clair, ni mot de passe, ni session ne passent par ici.
 */
export const dmbookQueries = {
  connexions: () =>
    queryOptions({
      queryKey: ['dmbook', 'connexions'],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('dmbook_connexions_public')
        if (error) throw error
        return data
      },
      // Le serveur change l'état seul (code demandé, session expirée) : on relit.
      refetchInterval: 30_000,
      retry: false,
    }),
}

export type ConnexionDmbook =
  Database['public']['Functions']['dmbook_connexions_public']['Returns'][number]
