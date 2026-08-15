import { createFileRoute } from '@tanstack/react-router'
import { GammesExplorer } from '@/features/gammes/components/gammes-explorer'
import { PageContainer } from '@/components/common/page-container'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { PAGE_META } from '@/features/gammes/page-meta'

/**
 * Plan de maintenance : page unique, navigation par CATÉGORIE portée par le CHEMIN
 * d'URL (route splat `$`) : `/gammes/<catégorie>/<sous-catégorie>/<gamme>`, segments
 * slugifiés. La descente puis l'ouverture d'une gamme (feuille) sont résolues par
 * l'explorateur. Chemin nu `/gammes` (splat vide) → racine (liste des catégories).
 * La garde de rôle est portée par le layout parent (`requireNav`).
 *
 * `?open=<gammeId>` : ouverture DIRECTE d'une gamme depuis une autre page (ex. onglet
 * Gammes d'un prestataire) sans avoir à reconstruire le chemin de catégories —
 * l'explorateur résout l'id et réécrit l'URL sur le chemin propre. Param transitoire.
 */
export const Route = createFileRoute('/_app/gammes/$')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => ({
    open: typeof search.open === 'string' ? search.open : undefined,
  }),
  component: GammesPage,
})

function GammesPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => (
        // `fill` : l'explorateur gère lui-même en-tête fixe + défilement, car le
        // palier sous-catégorie est un SPLIT 50/50 (gammes / OT) à double scroll.
        <PageContainer fill>
          {/* key=site : remise à zéro des états internes au changement de site. */}
          <GammesExplorer key={siteId} siteId={siteId} />
        </PageContainer>
      )}
    </SiteScopedRoute>
  )
}
