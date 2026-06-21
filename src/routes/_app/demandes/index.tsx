import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Plus } from 'lucide-react'
import { demandesQueries } from '@/features/demandes/queries'
import { DiFormDialog } from '@/features/demandes/components/di-form-dialog'
import { diTitre } from '@/features/demandes/schemas'
import { statutBadgeVariant, statutLabel } from '@/features/demandes/etat'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { segOfUnique } from '@/lib/slug'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSearchResults } from '@/components/common/no-search-results'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { SearchInput } from '@/components/common/search-input'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/_app/demandes/')({
  component: DemandesPage,
})

function DemandesPage() {
  const { data: role } = useCurrentRole()
  // lecteur = lecture seule ; les autres rôles peuvent créer une DI (RLS arbitre).
  const canCreate = perm.canCreateDemande(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Demandes d'intervention"
        description="Signalements curatifs du site."
        hint="Choisis un site pour voir ses demandes d'intervention."
        icon={ClipboardList}
      />
    )
  }

  return <DemandesContent siteId={activeSiteId} canCreate={canCreate} />
}

function DemandesContent({
  siteId,
  canCreate,
}: {
  siteId: string
  canCreate: boolean
}) {
  const navigate = useNavigate()
  const query = useQuery(demandesQueries.list(siteId))
  const [formOpen, setFormOpen] = useState(false)
  const [recherche, setRecherche] = useState('')

  const newButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus /> Nouvelle demande
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Demandes d'intervention"
        description="Signalements curatifs du site (constat, suivi, résolution)."
        action={
          canCreate ? (
            <TooltipIconButton
              icon={<Plus />}
              label="Nouvelle demande"
              variant="outline"
              onClick={() => setFormOpen(true)}
            />
          ) : undefined
        }
      />

      <QueryState
        query={query}
        pending={<ListRowSkeletons count={4} />}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="Aucune demande"
            description={
              canCreate
                ? "Crée une première demande d'intervention pour signaler un problème."
                : "Aucune demande d'intervention pour ce site."
            }
            action={newButton}
          />
        }
      >
        {(demandes) => {
          const q = recherche.trim().toLowerCase()
          const shown = q
            ? demandes.filter(
                (d) =>
                  diTitre(d.constat).toLowerCase().includes(q) ||
                  d.constat.toLowerCase().includes(q),
              )
            : demandes
          // Frères pour le slug d'URL : MÊME ensemble qu'à la résolution dans la
          // fiche détail (symétrie segOfUnique), sur la liste NON filtrée.
          const sibs = demandes.map((d) => ({
            nom: diTitre(d.constat),
            id: d.id,
          }))
          return (
            <div className="flex flex-col gap-4">
              <SearchInput
                value={recherche}
                onChange={setRecherche}
                placeholder="Rechercher une demande…"
                className="max-w-sm"
              />
              {shown.length === 0 ? (
                <NoSearchResults description="Aucune demande ne correspond à cette recherche." />
              ) : (
                <div className={listStack}>
                  {shown.map((d) => (
                    <ListRow
                      key={d.id}
                      media={<RowMediaIcon icon={ClipboardList} />}
                      title={diTitre(d.constat)}
                      subtitle={`Constaté le ${formatDate(d.date_constat)}`}
                      onClick={() =>
                        void navigate({
                          to: '/demandes/$demande',
                          params: {
                            demande: segOfUnique(
                              { nom: diTitre(d.constat), id: d.id },
                              sibs,
                            ),
                          },
                        })
                      }
                      badges={
                        <Badge variant={statutBadgeVariant(d.statut_di_id)}>
                          {statutLabel(d.statut_di_id)}
                        </Badge>
                      }
                      mobileMeta={statutLabel(d.statut_di_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        }}
      </QueryState>

      {canCreate && (
        <DiFormDialog
          key={formOpen ? 'open' : 'closed'}
          open={formOpen}
          onOpenChange={setFormOpen}
          siteId={siteId}
        />
      )}
    </PageContainer>
  )
}
