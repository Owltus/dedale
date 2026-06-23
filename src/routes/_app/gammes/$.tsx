import { createFileRoute } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
import { GammesExplorer } from '@/features/gammes/components/gammes-explorer'
import { useSiteContext } from '@/lib/site-context'
import { PageContainer } from '@/components/common/page-container'
import { NoSiteSelected } from '@/components/common/no-site-selected'

/**
 * Plan de maintenance : page unique, navigation par CATÉGORIE portée par le CHEMIN
 * d'URL (route splat `$`) : `/gammes/<catégorie>/<sous-catégorie>/<gamme>`, segments
 * slugifiés. La descente puis l'ouverture d'une gamme (feuille) sont résolues par
 * l'explorateur. Chemin nu `/gammes` (splat vide) → racine (liste des catégories).
 * La garde de rôle est portée par le layout parent (`requireNav`).
 */
export const Route = createFileRoute('/_app/gammes/$')({
  component: GammesPage,
})

function GammesPage() {
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Plan de maintenance"
        description="Gammes de maintenance et de contrôle réglementaire du site."
        hint="Choisis un site actif pour gérer ses gammes."
        icon={Wrench}
      />
    )
  }

  return (
    <PageContainer>
      {/* key=site : remonte l'explorer à chaque changement de site actif → remise à
          zéro propre des états internes (drill, modaux). */}
      <GammesExplorer key={activeSiteId} siteId={activeSiteId} />
    </PageContainer>
  )
}
