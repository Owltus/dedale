import { createFileRoute } from '@tanstack/react-router'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/ordres-travail/page-meta'
import { OrdresTravailListe } from '@/features/ordres-travail/components/ordres-travail-liste'

export const Route = createFileRoute('/_app/ordres-travail/')({
  component: OrdresTravailPage,
})

function OrdresTravailPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        <OrdresTravailListe siteId={siteId} canManage={canManage} />
      )}
    </SiteScopedRoute>
  )
}
