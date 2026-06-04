import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Gauge, LineChart } from 'lucide-react'
import { relevesQueries } from '@/features/releves/queries'
import type { GammeMesurable } from '@/features/releves/queries'
import { GammeMesuresDetail } from '@/features/releves/components/gamme-mesures-detail'
import { useSiteContext } from '@/lib/site-context'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/releves')({
  component: RelevesPage,
})

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4'

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('fr-FR') : '—'
}

function RelevesPage() {
  const { activeSiteId } = useSiteContext()
  const [selected, setSelected] = useState<{
    cle: string
    nom: string
  } | null>(null)

  if (!activeSiteId) {
    return (
      <div className="p-6">
        <PageHeader
          title="Relevés"
          description="Historique des mesures relevées lors des ordres de travail."
        />
        <EmptyState
          icon={Gauge}
          title="Sélectionne un site"
          description="Choisis un site actif pour consulter ses relevés."
        />
      </div>
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
  const {
    data: gammes = [],
    isPending,
    isError,
    refetch,
  } = useQuery(relevesQueries.gammes(siteId))

  return (
    <div className="p-6">
      <PageHeader
        title="Relevés"
        description="Historique des mesures relevées lors des ordres de travail."
      />

      {isPending ? (
        <div className={GRID}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : gammes.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Aucun relevé"
          description="Aucune mesure n'a encore été relevée sur ce site. Les valeurs saisies lors des ordres de travail apparaîtront ici."
        />
      ) : (
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
    </div>
  )
}
