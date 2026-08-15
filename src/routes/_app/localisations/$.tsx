import { createFileRoute } from '@tanstack/react-router'
import { LocalisationsExplorer } from '@/features/localisations/components/localisations-explorer'
import { PageContainer } from '@/components/common/page-container'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/localisations/page-meta'

/**
 * Localisations : navigation par CHEMIN d'URL (route splat `$`) :
 * `/localisations/<bâtiment>/<niveau>`, segments slugifiés. Racine = bâtiments du
 * site → niveaux → locaux. Chemin nu `/localisations` (splat vide) → racine. La
 * garde de rôle est portée par le layout parent (`requireNav`).
 */
export const Route = createFileRoute('/_app/localisations/$')({
  component: LocalisationsPage,
})

function LocalisationsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => (
        <PageContainer fill>
          <LocalisationsExplorer siteId={siteId} />
        </PageContainer>
      )}
    </SiteScopedRoute>
  )
}
