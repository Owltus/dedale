import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Gauge } from 'lucide-react'
import { relevesQueries } from '@/features/releves/queries'
import { PAGE_META } from '@/features/releves/page-meta'
import { segOfUnique } from '@/lib/slug'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ListPageBody } from '@/components/common/list-page-body'
import { SiteScopedRoute } from '@/components/common/site-scoped-route'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'

export const Route = createFileRoute('/_app/releves/')({
  component: RelevesIndexPage,
})

function RelevesIndexPage() {
  return (
    <SiteScopedRoute meta={PAGE_META}>
      {({ siteId }) => <RelevesList siteId={siteId} />}
    </SiteScopedRoute>
  )
}

function RelevesList({ siteId }: { siteId: string }) {
  const navigate = useNavigate()
  const query = useQuery(relevesQueries.gammesListe(siteId))
  const [search, setSearch] = useState('')

  return (
    <PageContainer>
      <PageHeader title={PAGE_META.titre} description={PAGE_META.description} />

      <QueryState
        query={query}
        pending={<ListRowSkeletons />}
        empty={
          <EmptyState
            icon={Gauge}
            title="Aucun relevé"
            description="Aucune gamme n'a de relevé (mesure ou compteur) enregistré sur ce site."
          />
        }
      >
        {(gammes) => {
          const sibs = gammes.map((g) => ({ nom: g.nomGamme, id: g.id }))
          const q = search.trim().toLowerCase()
          const shown = q
            ? gammes.filter((g) => g.nomGamme.toLowerCase().includes(q))
            : gammes
          return (
            <ListPageBody
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Rechercher une gamme…"
              isEmpty={shown.length === 0}
              emptySearchDescription="Aucune gamme ne correspond à cette recherche."
            >
              {shown.map((g) => (
                <ListRow
                  key={g.id}
                  media={<RowMediaIcon icon={Gauge} />}
                  title={g.nomGamme}
                  subtitle={`${String(g.nbTypes)} type${g.nbTypes > 1 ? 's' : ''} de relevé`}
                  meta={`${String(g.nbOt)} OT`}
                  mobileMeta={
                    g.dernierReleve
                      ? `Dernier relevé : ${formatDateAvecSemaineIso(g.dernierReleve)}`
                      : undefined
                  }
                  onClick={() =>
                    void navigate({
                      to: '/releves/$releve',
                      params: {
                        releve: segOfUnique(
                          { nom: g.nomGamme, id: g.id },
                          sibs,
                        ),
                      },
                    })
                  }
                />
              ))}
            </ListPageBody>
          )
        }}
      </QueryState>
    </PageContainer>
  )
}
