import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { SitesListe } from '@/features/sites/components/sites-liste'

export const Route = createFileRoute('/_app/sites')({
  beforeLoad: ({ context }) => requireNav('/sites', context.queryClient),
  component: SitesListe,
})
