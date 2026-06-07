import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { requireNav } from '@/lib/nav-guard'
import { useQuery } from '@tanstack/react-query'
import { Hammer, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  chantiersQueries,
  statutsChantierQueries,
} from '@/features/chantiers/queries'
import { useDeleteChantier } from '@/features/chantiers/mutations'
import { ChantierFormDialog } from '@/features/chantiers/components/chantier-form-dialog'
import { ChantierDetail } from '@/features/chantiers/components/chantier-detail'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { formatDate } from '@/lib/date'
import { errorMessage } from '@/lib/form'
import { cardGrid } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Chantier = Database['public']['Tables']['interventions_chantier']['Row']

export const Route = createFileRoute('/_app/chantiers')({
  beforeLoad: ({ context }) => requireNav('/chantiers', context.queryClient),
  component: ChantiersPage,
})

function ChantiersPage() {
  const { data: role } = useCurrentRole()
  const canManage = perm.canManageMetier(role)
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Interventions de chantier"
        description="Travaux ponctuels (hors DI et OT)."
        hint="Choisis un site pour voir ses chantiers."
        icon={Hammer}
      />
    )
  }

  return <ChantiersContent siteId={activeSiteId} canManage={canManage} />
}

function ChantiersContent({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const query = useQuery(chantiersQueries.list(siteId))
  const { data: statuts = [] } = useQuery(statutsChantierQueries.list())
  const del = useDeleteChantier()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<{
    open: boolean
    chantier: Chantier | null
  }>({ open: false, chantier: null })
  const [toDelete, setToDelete] = useState<Chantier | null>(null)

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))

  if (selectedId) {
    return (
      <PageContainer>
        <ChantierDetail
          chantierId={selectedId}
          siteId={siteId}
          canManage={canManage}
          onBack={() => setSelectedId(null)}
        />
      </PageContainer>
    )
  }

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Chantier supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const newButton = canManage ? (
    <Button onClick={() => setForm({ open: true, chantier: null })}>
      <Plus /> Nouveau chantier
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Interventions de chantier"
        description="Travaux ponctuels du site (souvent confiés à un prestataire)."
        action={newButton}
      />

      <QueryState
        query={query}
        pending={<CardSkeletons count={4} height="h-40" />}
        empty={
          <EmptyState
            icon={Hammer}
            title="Aucun chantier"
            description={
              canManage
                ? 'Crée un premier chantier pour suivre des travaux ponctuels.'
                : 'Aucun chantier enregistré pour ce site.'
            }
            action={newButton}
          />
        }
      >
        {(chantiers) => (
          <div className={cardGrid.default}>
            {chantiers.map((c) => (
              <Card
                key={c.id}
                className="hover:bg-accent/40 min-w-0 cursor-pointer transition-colors"
                onClick={() => setSelectedId(c.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate">{c.titre}</CardTitle>
                    <Badge variant="secondary" className="shrink-0">
                      {statutNom.get(c.statut_chantier_id) ?? 'Statut'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">Prestataire</dt>
                    <dd className="truncate text-right">
                      {c.prestataires?.libelle ?? '—'}
                    </dd>
                    <dt className="text-muted-foreground">Demande</dt>
                    <dd className="text-right">{formatDate(c.date_demande)}</dd>
                    <dt className="text-muted-foreground">Prévue</dt>
                    <dd className="text-right">{formatDate(c.date_prevue)}</dd>
                    <dt className="text-muted-foreground">Fin</dt>
                    <dd className="text-right">{formatDate(c.date_fin)}</dd>
                  </dl>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setToDelete(c)
                        }}
                      >
                        <Trash2 /> Supprimer
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>

      {canManage && (
        <ChantierFormDialog
          key={form.chantier?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          chantier={form.chantier}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer le chantier ?"
        description={
          toDelete
            ? `« ${toDelete.titre} » sera placé dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  )
}
