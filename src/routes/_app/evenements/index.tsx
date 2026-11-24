import { createFileRoute } from '@tanstack/react-router'
import { PAGE_META } from '@/features/evenements/page-meta'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { EvenementsListe } from '@/features/evenements/components/evenements-liste'

export const Route = createFileRoute('/_app/evenements/')({
  component: EvenementsPage,
})

function EvenementsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Journal de l'équipe technique (cf. RLS 077) : manager/technicien
        // consignent, éditent et suppriment sur leurs sites ; lecteur consulte.
        <EvenementsListe
          siteId={siteId}
          canManage={canManage}
          canDelete={canManage}
        />
      )}
    </SiteScopedRoute>
  )
}
