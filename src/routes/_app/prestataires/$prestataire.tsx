import { createFileRoute } from '@tanstack/react-router'
import { PrestataireEcran } from '@/features/prestataires/components/prestataire-ecran'

export const Route = createFileRoute('/_app/prestataires/$prestataire')({
  component: PrestataireEcran,
})
