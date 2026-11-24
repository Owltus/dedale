import { createFileRoute } from '@tanstack/react-router'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/travaux/page-meta'
import { TravauxListe } from '@/features/travaux/components/travaux-liste'

export const Route = createFileRoute('/_app/travaux/')({
  component: TravauxPage,
})

function TravauxPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Travaux = écran MÉTIER (cf. RLS) : manager/technicien créent/éditent
        // ET SUPPRIMENT sur leurs sites (migration 053), lecteur consulte.
        <TravauxListe
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
  )
}
