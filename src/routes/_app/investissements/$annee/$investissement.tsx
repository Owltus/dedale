import { createFileRoute } from '@tanstack/react-router'
import { InvestissementEcran } from '@/features/investissements/components/investissement-ecran'

export const Route = createFileRoute(
  '/_app/investissements/$annee/$investissement',
)({
  component: InvestissementEcran,
})
