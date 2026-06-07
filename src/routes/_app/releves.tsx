import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Gauge, LineChart } from 'lucide-react'
import { relevesQueries } from '@/features/releves/queries'
import type { GammeMesurable } from '@/features/releves/queries'
import { GammeMesuresDetail } from '@/features/releves/components/gamme-mesures-detail'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { cardGrid } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/_app/releves')({
  beforeLoad: ({ context }) => requireNav('/releves', context.queryClient),
  component: RelevesPage,
})

const GRID = cardGrid.default

function RelevesPage() {
  const { activeSiteId } = useSiteContext()
  const [selected, setSelected] = useState<{
    cle: string
    nom: string
  } | null>(null)

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Relevés"
        description="Historique des mesures relevées lors des ordres de travail."
        hint="Choisis un site actif pour consulter ses relevés."
        icon={Gauge}
      />
    )
  }

  if (selected) {
    return (
      <GammeMesuresDetail
        siteId={activeSiteId}
        cleGamme={selected.cle}
        nomGamme={selected.nom}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <RelevesList
      siteId={activeSiteId}
      onOpen={(g) => setSelected({ cle: g.cle, nom: g.nomGamme })}
    />
  )
}

function RelevesList({
  siteId,
  onOpen,
}: {
  siteId: string
  onOpen: (gamme: GammeMesurable) => void
}) {
  const query = useQuery(relevesQueries.gammes(siteId))

  return (
    <PageContainer>
      <PageHeader
        title="Relevés"
        description="Historique des mesures relevées lors des ordres de travail."
      />

      <QueryState
        query={query}
        pending={<CardSkeletons count={6} height="h-36" />}
        empty={
          <EmptyState
            icon={LineChart}
            title="Aucun relevé"
            description="Aucune mesure n'a encore été relevée sur ce site. Les valeurs saisies lors des ordres de travail apparaîtront ici."
          />
        }
      >
        {(gammes) => (
          <div className={GRID}>
            {gammes.map((g) => (
              <Card key={g.cle} className="min-w-0">
                <CardHeader>
                  <CardTitle className="truncate">{g.nomGamme}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground flex flex-col gap-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">
                      {g.nbMesures} mesure{g.nbMesures > 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline">
                      Dernier : {formatDate(g.dernierReleve)}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={() => onOpen(g)}
                  >
                    <ChevronRight /> Voir les courbes
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </PageContainer>
  )
}
