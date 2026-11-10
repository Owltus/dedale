import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { CalendarRange } from 'lucide-react'
import {
  investissementsQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import {
  anneeBudgetEnPreparation,
  anneesBudget,
  totauxAnnee,
} from '@/features/investissements/etat'
import { BarreBudget } from '@/features/investissements/components/barre-budget'
import { PAGE_META } from '@/features/investissements/page-meta'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'

export const Route = createFileRoute('/_app/investissements/')({
  component: BudgetsPage,
})

/**
 * Page Budget, PREMIER niveau (138, demande PO du 10/11/2026) : les années de
 * budget, chacune avec ses totaux. Un clic ouvre les investissements de
 * l'année.
 *
 * Les budgets se créent SEULS (demande PO) : celui de l'an prochain est
 * toujours là, et passe à l'année suivante au 1er janvier ; un autre n'apparaît
 * qu'avec des dossiers (un report). Rien à créer ici : on ajoute un
 * investissement DANS un budget.
 */
function BudgetsPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => <BudgetsContent siteId={siteId} />}
    </SiteScopedRoute>
  )
}

function BudgetsContent({ siteId }: { siteId: string }) {
  const navigate = useNavigate()
  const query = useQuery(investissementsQueries.list(siteId))
  useRealtimeRefresh('investissements', investissementsQueries.all())
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))

  return (
    <PageContainer>
      <PageHeader
        title={PAGE_META.titre}
        description="Un budget par année, préparé un an à l'avance. Ouvre un budget pour y ajouter un investissement."
      />

      <QueryState query={query} pending={<ListRowSkeletons />}>
        {(investissements) => (
          <div className="flex flex-col gap-2">
            {anneesBudget(
              investissements.map((i) => i.annee_budget),
              anneeBudgetEnPreparation(),
            ).map((annee) => {
              const invs = investissements.filter(
                (i) => i.annee_budget === annee,
              )
              const t = totauxAnnee(invs)
              // La MÊME barre que sur la page du budget (demande PO), à droite
              // au bureau, sous le titre sur téléphone.
              const barre =
                t.nb > 0 ? (
                  <BarreBudget investissements={invs} noms={noms} />
                ) : undefined
              return (
                <ListRow
                  key={annee}
                  media={<RowMediaIcon icon={CalendarRange} />}
                  title={`Budget ${String(annee)}`}
                  subtitle={
                    t.nb === 0
                      ? 'Aucune demande pour le moment'
                      : `${String(t.nb)} dossier${t.nb > 1 ? 's' : ''}`
                  }
                  // La barre prend TOUTE la place laissée par « Budget N »
                  // (demande PO), sans jamais la chevaucher.
                  meta={barre}
                  metaEtiree
                  mobileMeta={barre && <div className="pt-1">{barre}</div>}
                  onClick={() =>
                    void navigate({
                      to: '/investissements/$annee',
                      params: { annee: String(annee) },
                    })
                  }
                />
              )
            })}
          </div>
        )}
      </QueryState>
    </PageContainer>
  )
}
