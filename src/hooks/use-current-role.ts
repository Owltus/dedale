import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** Rôle de l'utilisateur connecté (code texte), via la RPC public.current_role(). */
export function useCurrentRole() {
  return useQuery({
    queryKey: ['current_role'],
    queryFn: async () => {
      const res = await supabase.rpc('current_role')
      if (res.error) throw res.error
      return res.data
    },
    staleTime: 5 * 60_000,
  })
}
