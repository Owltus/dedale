import { queryOptions, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Options de requête du rôle de l'utilisateur connecté (code texte), via la RPC
 * public.current_role(). Partagées entre le hook (composants) et les gardes de
 * route (`requireNav`), pour une seule source et un cache commun.
 */
export const currentRoleQueryOptions = queryOptions({
  queryKey: ['current_role'],
  queryFn: async () => {
    const res = await supabase.rpc('current_role')
    if (res.error) throw res.error
    return res.data
  },
  staleTime: 5 * 60_000,
})

/** Rôle de l'utilisateur connecté (code texte), via la RPC public.current_role(). */
export function useCurrentRole() {
  return useQuery(currentRoleQueryOptions)
}
