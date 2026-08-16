import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { PageEnPreparation } from '@/components/common/page-en-preparation'

export const Route = createFileRoute('/_app/releves')({
  beforeLoad: ({ context }) => requireNav('/releves', context.queryClient),
  component: RelevesPage,
})

function RelevesPage() {
  return (
    <PageEnPreparation
      titre="Relevés"
      description="Historique des mesures relevées lors des ordres de travail."
    />
  )
}
