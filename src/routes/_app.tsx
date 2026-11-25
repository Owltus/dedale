import { createFileRoute, redirect } from '@tanstack/react-router'
import { currentRoleQueryOptions } from '@/features/utilisateurs/queries'
import { sitesQueries } from '@/features/sites/queries'
import { AppLayout } from '@/components/layout/app-layout'

export const Route = createFileRoute('/_app')({
  // Garde d'authentification factorisée pour tous les écrans de l'app.
  beforeLoad: async ({ context }) => {
    if (!context.auth.session) {
      throw redirect({ to: '/login' })
    }
    // Pré-résout rôle ET sites (mis en cache) pour décider le layout sans flash
    // (demandeur = top bar ; aucun site = écran dédié) et alimenter les gardes
    // enfants. Fail-open : si la RPC échoue, on ne bloque pas — LayoutSwitch
    // choisit selon le rôle chargé (DefaultLayout s'il reste absent). La RLS
    // demeure la sécurité réelle.
    try {
      await Promise.all([
        context.queryClient.ensureQueryData(currentRoleQueryOptions),
        context.queryClient.ensureQueryData(sitesQueries.mine()),
      ])
    } catch {
      // rôle/sites indisponibles : fail-open (cf. ci-dessus)
    }
  },
  component: AppLayout,
})
