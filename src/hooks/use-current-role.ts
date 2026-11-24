import { useQuery } from '@tanstack/react-query'
import { currentRoleQueryOptions } from '@/features/utilisateurs/queries'

/** Rôle de l'utilisateur connecté (code texte), via la RPC public.current_role(). */
export function useCurrentRole() {
  return useQuery(currentRoleQueryOptions)
}
