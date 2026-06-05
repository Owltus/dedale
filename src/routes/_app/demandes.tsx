import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { demandesQueries } from '@/features/demandes/queries'
import { DiFormDialog } from '@/features/demandes/components/di-form-dialog'
import { DiDetail } from '@/features/demandes/components/di-detail'
import { diTitre } from '@/features/demandes/schemas'
import { statutBadgeVariant, statutLabel } from '@/features/demandes/etat'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { cardGrid } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/demandes')({
  component: DemandesPage,
})

function DemandesPage() {
  const { data: role } = useCurrentRole()
  const { activeSiteId } = useSiteContext()
  // lecteur = lecture seule ; tous les autres rôles peuvent créer une DI (RLS arbitre).
  const canCreate = role !== undefined && role !== 'lecteur'
  // Résolution/réouverture : rôles ayant accès opérationnel au site.
  const canResolve =
    role === 'admin' || role === 'manager' || role === 'technicien'

  if (!activeSiteId) {
    return (
      <PageContainer>
        <PageHeader
          title="Demandes d'intervention"
          description="Signalements curatifs du site."
        />
        <EmptyState
          icon={ClipboardList}
          title="Sélectionne un site"
          description="Choisis un site pour voir ses demandes d'intervention."
        />
      </PageContainer>
    )
  }

  return (
    <DemandesContent
      siteId={activeSiteId}
      canCreate={canCreate}
      canResolve={canResolve}
    />
  )
}

function DemandesContent({
  siteId,
  canCreate,
  canResolve,
}: {
  siteId: string
  canCreate: boolean
  canResolve: boolean
}) {
  const {
    data: demandes = [],
    isPending,
    isError,
    refetch,
  } = useQuery(demandesQueries.list(siteId))
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return demandes
    return demandes.filter((d) => diTitre(d.constat).toLowerCase().includes(q))
  }, [demandes, search])

  const newButton = canCreate ? (
    <Button onClick={() => setFormOpen(true)}>
      <Plus /> Nouvelle demande
    </Button>
  ) : undefined

  // Vue détail en page (remplace la liste).
  if (selectedId) {
    return (
      <PageContainer>
        <PageHeader
          title="Demande d'intervention"
          description="Détail du signalement et de sa résolution."
        />
        <DiDetail
          diId={selectedId}
          canResolve={canResolve}
          onBack={() => setSelectedId(null)}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Demandes d'intervention"
        description="Signalements curatifs du site (constat, suivi, résolution)."
        action={newButton}
      />

      {!isPending && !isError && demandes.length > 0 && (
        <div className="relative mb-4 max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par titre…"
            className="pl-8"
          />
        </div>
      )}

      {isPending ? (
        <div className={cardGrid.default}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : demandes.length === 0 ? (
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
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Aucun résultat"
          description="Aucune demande ne correspond à ta recherche."
        />
      ) : (
        <div className={cardGrid.default}>
          {filtered.map((d) => (
            <Card
              key={d.id}
              className="hover:border-ring min-w-0 cursor-pointer transition-colors"
              onClick={() => setSelectedId(d.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="line-clamp-2 text-base">
                    {diTitre(d.constat)}
                  </CardTitle>
                  <Badge
                    variant={statutBadgeVariant(d.statut_di_id)}
                    className="shrink-0"
                  >
                    {statutLabel(d.statut_di_id)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                <p className="line-clamp-2">{d.constat}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
