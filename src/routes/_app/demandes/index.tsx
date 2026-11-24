import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/auth'
import * as perm from '@/lib/permissions'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/demandes/page-meta'
import { DemandesListe } from '@/features/demandes/components/demandes-liste'

export const Route = createFileRoute('/_app/demandes/')({
  component: DemandesPage,
})

function DemandesPage() {
  const { session } = useAuth()

  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, role }) => (
        <DemandesListe
          siteId={siteId}
          // lecteur = lecture seule ; les autres rôles peuvent créer une DI
          // (la RLS arbitre) — pas le canManage générique de la brique.
          canCreate={perm.canCreateDemande(role)}
          role={role}
          userId={session?.user.id}
        />
      )}
    </SiteScopedRoute>
  )
}
