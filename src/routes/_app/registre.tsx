import { createFileRoute } from '@tanstack/react-router'
import { Construction } from 'lucide-react'
import { requireNav } from '@/lib/nav-guard'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'

export const Route = createFileRoute('/_app/registre')({
  beforeLoad: ({ context }) => requireNav('/registre', context.queryClient),
  component: RegistrePage,
})

function RegistrePage() {
  return (
    <PageContainer>
      <PageHeader
        title="Registre de sécurité"
        description="Observations de conformité et registre de sécurité du site."
      />
      <EmptyState
        icon={Construction}
        title="Page en travaux"
        description="Cette section est en cours de refonte et sera bientôt disponible."
      />
    </PageContainer>
  )
}
