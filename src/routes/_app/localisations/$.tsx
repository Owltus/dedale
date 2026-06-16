import { createFileRoute } from '@tanstack/react-router'
import { Building2 } from 'lucide-react'
import { LocalisationsExplorer } from '@/features/localisations/components/localisations-explorer'
import { useSiteContext } from '@/lib/site-context'
import { PageContainer } from '@/components/common/page-container'
import { NoSiteSelected } from '@/components/common/no-site-selected'

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
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Localisations"
        description="Bâtiments, niveaux et locaux du site."
        hint="Choisis un site actif pour gérer ses localisations."
        icon={Building2}
      />
    )
  }

  return (
    <PageContainer>
      <LocalisationsExplorer siteId={activeSiteId} />
    </PageContainer>
  )
}
