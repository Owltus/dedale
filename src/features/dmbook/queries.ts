import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

/**
 * État de la connexion Dédale → Dmbook (migration 163), via `dmbook_etat_public()`.
 * La base ne répond qu'aux admin / manager / technicien du site lié (D15) : pour
 * les autres, la réponse est vide et rien ne s'affiche. Ni session, ni adresse
 * Dmbook, ni code ne passent par ici.
 */
export const dmbookQueries = {
  etat: () =>
    queryOptions({
      queryKey: ['dmbook', 'etat'],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('dmbook_etat_public')
        if (error) throw error
        return data[0] ?? null
      },
      // Le serveur change l'état seul (code demandé, session expirée) : on relit.
      refetchInterval: 30_000,
      retry: false,
    }),
}

export type EtatDmbook =
  Database['public']['Functions']['dmbook_etat_public']['Returns'][number]
