import { createFileRoute } from '@tanstack/react-router'
import { EquipementsExplorer } from '@/features/equipements/components/equipements-explorer'
import { PageContainer } from '@/components/common/page-container'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/equipements/page-meta'

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
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => (
        <PageContainer>
          {/* key=site : remonte l'explorer à chaque changement de site actif →
              remise à zéro propre des refs/états internes (drill, modaux), pas
              de fuite d'état du site précédent. */}
          <EquipementsExplorer key={siteId} siteId={siteId} />
        </PageContainer>
      )}
    </SiteScopedRoute>
  )
}
