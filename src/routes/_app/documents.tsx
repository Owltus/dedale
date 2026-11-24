import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/documents/page-meta'
import { TousLesDocuments } from '@/features/documents/components/tous-les-documents'

export const Route = createFileRoute('/_app/documents')({
  beforeLoad: ({ context }) => requireNav('/documents', context.queryClient),
  component: DocumentsPage,
})

function DocumentsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Hard-delete d'un document = manager + technicien sur leurs sites
        // (migration 053) : même permission que la gestion.
        <TousLesDocuments
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
  )
}
