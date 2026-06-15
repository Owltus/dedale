import { createFileRoute } from '@tanstack/react-router'
import { Package } from 'lucide-react'
import { EquipementsExplorer } from '@/features/equipements/components/equipements-explorer'
import { useSiteContext } from '@/lib/site-context'
import { PageContainer } from '@/components/common/page-container'
import { NoSiteSelected } from '@/components/common/no-site-selected'

/**
 * Équipements : page unique du parc, navigation par CATÉGORIE portée par le CHEMIN
 * d'URL (route splat `$`) : `/equipements/<catégorie>/…/<équipement>`, segments
 * slugifiés. Le 1er segment porte la catégorie racine ; la descente puis l'ouverture
 * d'un équipement (feuille) sont résolues par l'explorateur. Chemin nu
 * `/equipements` (splat vide) → racine (liste des catégories). La garde de rôle est
 * portée par le layout parent (`requireNav`).
 */
export const Route = createFileRoute('/_app/equipements/$')({
  component: EquipementsPage,
})

function EquipementsPage() {
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Équipements"
        description="Parc matériel du site, rangé par catégorie."
        hint="Choisis un site actif pour gérer ses équipements."
        icon={Package}
      />
    )
  }

  return (
    <PageContainer>
      <EquipementsExplorer siteId={activeSiteId} />
    </PageContainer>
  )
}
