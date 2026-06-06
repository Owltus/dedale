import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import {
  investissementsQueries,
  statutsCapexQueries,
} from '@/features/investissements/queries'
import { useDeleteInvestissement } from '@/features/investissements/mutations'
import { InvestissementFormDialog } from '@/features/investissements/components/investissement-form-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSiteContext } from '@/lib/site-context'
import { errorMessage } from '@/lib/form'
import { cardGrid } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { EmptyState } from '@/components/common/empty-state'
import { NoSiteSelected } from '@/components/common/no-site-selected'
import { ErrorState } from '@/components/common/error-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export const Route = createFileRoute('/_app/investissements')({
  component: InvestissementsPage,
})

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
})

function formatEuros(value: number | null): string {
  return value === null ? '—' : euros.format(value)
}

function InvestissementsPage() {
  const { data: role } = useCurrentRole()
  const canManage = role === 'admin' || role === 'manager'
  const { activeSiteId } = useSiteContext()

  if (!activeSiteId) {
    return (
      <NoSiteSelected
        title="Investissements (CapEx)"
        description="Suivi budgétaire des investissements par site."
        hint="Choisis un site pour voir ses investissements."
        icon={Wallet}
      />
    )
  }

  return <InvestissementsContent siteId={activeSiteId} canManage={canManage} />
}

function InvestissementsContent({
  siteId,
  canManage,
}: {
  siteId: string
  canManage: boolean
}) {
  const {
    data: investissements = [],
    isPending,
    isError,
    refetch,
  } = useQuery(investissementsQueries.list(siteId))
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const del = useDeleteInvestissement()
  const [form, setForm] = useState<{
    open: boolean
    investissement: Investissement | null
  }>({ open: false, investissement: null })
  const [toDelete, setToDelete] = useState<Investissement | null>(null)

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))

  function confirmDelete() {
    if (!toDelete) return
    del.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Investissement supprimé')
        setToDelete(null)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  const newButton = canManage ? (
    <Button onClick={() => setForm({ open: true, investissement: null })}>
      <Plus /> Nouvel investissement
    </Button>
  ) : undefined

  return (
    <PageContainer>
      <PageHeader
        title="Investissements (CapEx)"
        description="Suivi budgétaire des investissements du site (montant demandé, prévu, réel)."
        action={newButton}
      />

      {isPending ? (
        <div className={cardGrid.default}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : investissements.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Aucun investissement"
          description={
            canManage
              ? 'Crée un premier investissement pour suivre son budget.'
              : 'Aucun investissement enregistré pour ce site.'
          }
          action={newButton}
        />
      ) : (
        <div className={cardGrid.default}>
          {investissements.map((inv) => {
            const ecart =
              inv.montant_prevu !== null && inv.depense_reelle !== null
                ? inv.depense_reelle - inv.montant_prevu
                : null
            return (
              <Card key={inv.id} className="min-w-0">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate">{inv.libelle}</CardTitle>
                    <Badge variant="secondary" className="shrink-0">
                      {statutNom.get(inv.statut_capex_id) ?? 'Statut'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  {inv.description && (
                    <p className="text-muted-foreground line-clamp-2">
                      {inv.description}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <dt className="text-muted-foreground">Demandé</dt>
                    <dd className="text-right tabular-nums">
                      {formatEuros(inv.montant_demande)}
                    </dd>
                    <dt className="text-muted-foreground">Prévu</dt>
                    <dd className="text-right tabular-nums">
                      {formatEuros(inv.montant_prevu)}
                    </dd>
                    <dt className="text-muted-foreground">Réel</dt>
                    <dd className="text-right tabular-nums">
                      {formatEuros(inv.depense_reelle)}
                    </dd>
                    <dt className="text-muted-foreground">Écart prévu/réel</dt>
                    <dd
                      className={
                        ecart === null
                          ? 'text-right tabular-nums'
                          : ecart > 0
                            ? 'text-destructive text-right tabular-nums'
                            : 'text-right tabular-nums'
                      }
                    >
                      {ecart === null
                        ? '—'
                        : `${ecart > 0 ? '+' : ''}${euros.format(ecart)}`}
                    </dd>
                  </dl>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setForm({ open: true, investissement: inv })
                        }
                      >
                        <Pencil /> Modifier
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setToDelete(inv)}
                      >
                        <Trash2 /> Supprimer
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {canManage && (
        <InvestissementFormDialog
          key={form.investissement?.id ?? 'new'}
          open={form.open}
          onOpenChange={(open) => setForm((f) => ({ ...f, open }))}
          siteId={siteId}
          investissement={form.investissement}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null)
        }}
        title="Supprimer l'investissement ?"
        description={
          toDelete
            ? `« ${toDelete.libelle} » sera placé dans la corbeille (récupérable 90 jours).`
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
