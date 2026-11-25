import { createFileRoute } from '@tanstack/react-router'
import { PrestataireEcran } from '@/features/prestataires/components/prestataire-ecran'
import { PrestataireGammesPanel } from '@/features/gammes/components/prestataire-gammes-panel'

export const Route = createFileRoute('/_app/prestataires/$prestataire')({
  component: PrestatairePage,
})

// Onglet Gammes injecté ici : prestataires ne dépend pas de gammes (qui dépend,
// lui, de prestataires).
function PrestatairePage() {
  return <PrestataireEcran GammesPanel={PrestataireGammesPanel} />
}
