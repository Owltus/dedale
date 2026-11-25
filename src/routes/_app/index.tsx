import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { TableauDeBordEcran } from '@/features/dashboard/components/tableau-de-bord-ecran'

export const Route = createFileRoute('/_app/')({
  // Le demandeur n'a pas de tableau de bord : redirigé vers /demandes.
  beforeLoad: ({ context }) => requireNav('/', context.queryClient),
  component: TableauDeBordEcran,
})
