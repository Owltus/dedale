import { createFileRoute } from '@tanstack/react-router'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/ordres-travail/page-meta'
import { OrdresTravailListe } from '@/features/ordres-travail/components/ordres-travail-liste'
import { gammeNatures, NATURE_GAMME_LABEL } from '@/features/gammes/schemas'

export const Route = createFileRoute('/_app/ordres-travail/')({
  component: OrdresTravailPage,
})

function OrdresTravailPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId, canManage }) => (
        // Natures injectées ici : ordres-travail ne dépend pas de gammes.
        <OrdresTravailListe
          siteId={siteId}
          canManage={canManage}
          natures={gammeNatures}
          libellesNature={NATURE_GAMME_LABEL}
        />
      )}
    </SiteScopedRoute>
  )
}
