import { createFileRoute } from '@tanstack/react-router'
import { Construction } from 'lucide-react'
import { requireNav } from '@/lib/nav-guard'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'

export const Route = createFileRoute('/_app/releves')({
  beforeLoad: ({ context }) => requireNav('/releves', context.queryClient),
  component: RelevesPage,
})

function RelevesPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Relevés"
        description="Historique des mesures relevées lors des ordres de travail."
      />
      <EmptyState
        icon={Construction}
        title="Page en travaux"
        description="Cette section est en cours de refonte et sera bientôt disponible."
      />
    </PageContainer>
  )
}
