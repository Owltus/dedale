import { createFileRoute } from '@tanstack/react-router'
import { DemandeEcran } from '@/features/demandes/components/demande-ecran'

export const Route = createFileRoute('/_app/demandes/$demande')({
  component: DemandeEcran,
})
