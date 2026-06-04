import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { useDeleteOt } from '@/features/ordres-travail/mutations'
import {
  LIBELLES_STATUT_OT,
  variantStatutOt,
} from '@/features/ordres-travail/schemas'
import { OtCreateDialog } from '@/features/ordres-travail/components/ot-create-dialog'
import { OtDetail } from '@/features/ordres-travail/components/ot-detail'
import { useAuth } from '@/auth'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/ordres-travail')({
  component: OrdresTravailPage,
})

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR')
}

function OrdresTravailPage() {
  const { data: role } = useCurrentRole()
  const canManage =
    role === 'admin' || role === 'manager' || role === 'technicien'
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <div className="p-6">
        <PageHeader
          title="Ordres de travail"
          description="Exécution de la maintenance préventive et réglementaire."
        />
        <EmptyState
          icon={ClipboardList}
          title="Sélectionne un site"
          description="Choisis un site pour voir ses ordres de travail."
        />
      </div>
    )
  }

  return <OrdresTravailContent siteId={activeSiteId} canManage={canManage} />
}

function OrdresTravailContent({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const { session } = useAuth()
  const {
    data: ordres = [],
    isPending,
    isError,
    refetch,
  } = useQuery(ordresTravailQueries.list(siteId))
  const del = useDeleteOt()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [toDelete, setToDelete] = useState<{ id: string; nom: string } | null>(
    null,
  )

  if (selectedId) {
    return (
      <div className="p-6">
        <OtDetail
          otId={selectedId}
          canManage={canManage}
          onBack={() => setSelectedId(null)}
        />
      </div>
    )
  }

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('OT supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const newButton =
    canManage && session ? (
      <Button onClick={() => setCreateOpen(true)}>
        <Plus /> Nouvel OT
      </Button>
    ) : undefined

  return (
    <div className="p-6">
      <PageHeader
        title="Ordres de travail"
        description="Exécution de la maintenance préventive et réglementaire du site."
        action={newButton}
      />

      {isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : ordres.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Aucun ordre de travail"
          description={
            canManage
              ? 'Génère un OT depuis une gamme pour démarrer l’exécution.'
              : 'Aucun OT enregistré pour ce site.'
          }
          action={newButton}
        />
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-4">
          {ordres.map((ot) => (
            <Card
              key={ot.id}
              className="hover:bg-accent/40 min-w-0 cursor-pointer transition-colors"
              onClick={() => setSelectedId(ot.id)}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="truncate">{ot.nom_gamme}</CardTitle>
                  <Badge
                    variant={variantStatutOt(ot.statut)}
                    className="shrink-0"
                  >
                    {LIBELLES_STATUT_OT[ot.statut] ?? ot.statut}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Prestataire</dt>
                  <dd className="truncate text-right">{ot.nom_prestataire}</dd>
                  <dt className="text-muted-foreground">Équipement</dt>
                  <dd className="truncate text-right">
                    {ot.nom_equipement ?? '—'}
                  </dd>
                  <dt className="text-muted-foreground">Périodicité</dt>
                  <dd className="truncate text-right">
                    {ot.libelle_periodicite}
                  </dd>
                  <dt className="text-muted-foreground">Date prévue</dt>
                  <dd className="text-right">{formatDate(ot.date_prevue)}</dd>
                </dl>
                {canManage && (
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        setToDelete({ id: ot.id, nom: ot.nom_gamme })
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

      {canManage && session && (
        <OtCreateDialog
          key={createOpen ? 'open' : 'closed'}
          open={createOpen}
          onOpenChange={setCreateOpen}
          siteId={siteId}
          createdBy={session.user.id}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer l'ordre de travail ?"
        description={
          toDelete
            ? `« ${toDelete.nom} » sera placé dans la corbeille (récupérable 90 jours).`
            : undefined
        }
        confirmLabel="Supprimer"
        destructive
        loading={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
