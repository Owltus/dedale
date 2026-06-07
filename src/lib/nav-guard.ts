import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { currentRoleQueryOptions } from '@/hooks/use-current-role'
import type { Role } from '@/lib/permissions'
import { canSeeNav, landingFor, type NavKey } from '@/lib/nav'

/**
 * Garde de route (`beforeLoad`) : résout le rôle puis redirige vers la landing
 * du rôle si l'écran ne lui est pas destiné.
 *
 * Séparé de nav.ts (pur) car il tire la couche données (use-current-role →
 * supabase) et le routeur. Fail-open si le rôle est indisponible (RPC en échec)
 * : on laisse la page se charger, la RLS reste la sécurité réelle.
 */
export async function requireNav(
  navKey: NavKey,
  queryClient: QueryClient,
): Promise<void> {
  let role: Role
  try {
    role = await queryClient.ensureQueryData(currentRoleQueryOptions)
  } catch {
    // Rôle indisponible (RPC en échec) : fail-open, on ne bloque pas la
    // navigation — la RLS reste la sécurité. L'erreur n'est pas avalée en
    // silence : la même requête échoue aussi côté composant (useCurrentRole).
    return
  }
  if (!canSeeNav(navKey, role)) {
    throw redirect({ to: landingFor(role) })
  }
}
