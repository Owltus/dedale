import { createFileRoute } from '@tanstack/react-router'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/prestataires/page-meta'
import { PrestatairesListe } from '@/features/prestataires/components/prestataires-liste'

export const Route = createFileRoute('/_app/prestataires/')({
  component: PrestatairesIndexPage,
})

function PrestatairesIndexPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {/* Gérés par manager + technicien sur leurs sites (migration 053) ; le
          garde `!est_interne` + le trigger protègent le prestataire interne. */}
      {({ siteId, canManage }) => (
        <PrestatairesListe siteId={siteId} canManage={canManage} />
      )}
    </SiteScopedRoute>
  )
}
