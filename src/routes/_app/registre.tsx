import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { PageEnPreparation } from '@/components/common/page-en-preparation'

export const Route = createFileRoute('/_app/registre')({
  beforeLoad: ({ context }) => requireNav('/registre', context.queryClient),
  component: RegistrePage,
})

function RegistrePage() {
  return (
    <PageEnPreparation
      titre="Registre de sécurité"
      description="Observations de conformité et registre de sécurité du site."
    />
  )
}
