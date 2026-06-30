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
    // `fill` : l'explorateur gère lui-même en-tête fixe + défilement, car le palier
    // sous-catégorie est un SPLIT 50/50 (gammes / OT) à double scroll indépendant.
    <PageContainer fill>
      {/* key=site : remonte l'explorer à chaque changement de site actif → remise à
          zéro propre des états internes (drill, modaux). */}
      <GammesExplorer key={activeSiteId} siteId={activeSiteId} />
    </PageContainer>
  )
}
