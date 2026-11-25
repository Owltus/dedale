import { createFileRoute } from '@tanstack/react-router'
import { PAGE_META } from '@/features/releves/page-meta'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { RelevesListe } from '@/features/releves/components/releves-liste'

export const Route = createFileRoute('/_app/releves/')({
  component: RelevesIndexPage,
})

function RelevesIndexPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => <RelevesListe siteId={siteId} />}
    </SiteScopedRoute>
  )
}
