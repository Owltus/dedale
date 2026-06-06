import { useCurrentRole } from '@/hooks/use-current-role'
import * as permissions from '@/lib/permissions'

/**
 * Droits de l'utilisateur courant, dérivés de son rôle (`current_role`).
 * Sucre ergonomique au-dessus de `lib/permissions` pour les composants ; les
 * fonctions pures restent disponibles directement (ex. `canEditUser`).
 */
export function usePermissions() {
  const { data: role, isPending } = useCurrentRole()
  return {
    role,
    isPending,
    isAdmin: permissions.isAdmin(role),
    canManageMetier: permissions.canManageMetier(role),
    canManageAdmin: permissions.canManageAdmin(role),
    canCreateDemande: permissions.canCreateDemande(role),
    canResolveDemande: permissions.canResolveDemande(role),
  }
}
