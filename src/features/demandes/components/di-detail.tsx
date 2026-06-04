import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { demandesQueries } from '../queries'
import { useReopenDemande } from '../mutations'
import { DiResolveDialog } from './di-resolve-dialog'
import { statutBadgeVariant, statutLabel } from '../etat'
import { errorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { FileQuestion } from 'lucide-react'

interface DiDetailProps {
  diId: string
  canResolve: boolean
  onBack: () => void
}

type Tab = 'detail' | 'documents'

const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' })

function formatDate(value: string | null): string {
  return value ? dateFmt.format(new Date(value)) : '—'
}

export function DiDetail({ diId, canResolve, onBack }: DiDetailProps) {
  const {
    data: di,
    isPending,
    isError,
    refetch,
  } = useQuery(demandesQueries.detail(diId))
  const { data: localisations = [] } = useQuery(
    demandesQueries.localisations(diId),
  )
  const { data: equipements = [] } = useQuery(demandesQueries.equipements(diId))
  const reopen = useReopenDemande()
  const [tab, setTab] = useState<Tab>('detail')
  const [resolveOpen, setResolveOpen] = useState(false)

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-48" />
      </div>
    )
  }
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!di) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Demande introuvable"
        description="Cette demande n'existe plus ou ne t'est pas accessible."
        action={
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft /> Retour à la liste
          </Button>
        }
      />
    )
  }

  const isResolved = di.statut_di_id === 2

  function handleReopen() {
    reopen.mutate(diId, {
      onSuccess: () => toast.success('Demande réouverte'),
      onError: (e) => toast.error(errorMessage(e)),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft /> Retour
          </Button>
          <Badge variant={statutBadgeVariant(di.statut_di_id)}>
            {statutLabel(di.statut_di_id)}
          </Badge>
        </div>
        {canResolve && (
          <div className="flex gap-2">
            {isResolved ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopen}
                disabled={reopen.isPending}
              >
                <RotateCcw /> Réouvrir
              </Button>
            ) : (
              <Button size="sm" onClick={() => setResolveOpen(true)}>
                <CheckCircle2 /> Résoudre
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="border-border flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setTab('detail')}
          className={
            tab === 'detail'
              ? 'border-primary text-foreground -mb-px border-b-2 px-3 py-2 text-sm font-medium'
              : 'text-muted-foreground hover:text-foreground px-3 py-2 text-sm'
          }
        >
          Détail
        </button>
        <button
          type="button"
          onClick={() => setTab('documents')}
          className={
            tab === 'documents'
              ? 'border-primary text-foreground -mb-px border-b-2 px-3 py-2 text-sm font-medium'
              : 'text-muted-foreground hover:text-foreground px-3 py-2 text-sm'
          }
        >
          Documents
        </button>
      </div>

      {tab === 'detail' ? (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Constat</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              <p className="whitespace-pre-wrap">{di.constat}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Date de constat</dt>
                <dd>{formatDate(di.date_constat)}</dd>
                {localisations.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Localisations</dt>
                    <dd>{localisations.map((l) => l.locaux.nom).join(', ')}</dd>
                  </>
                )}
                {equipements.length > 0 && (
                  <>
                    <dt className="text-muted-foreground">Équipements</dt>
                    <dd>
                      {equipements.map((e) => e.equipements.nom).join(', ')}
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          {di.description_resolution && (
            <Card>
              <CardHeader>
                <CardTitle>Résolution</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 text-sm">
                <p className="whitespace-pre-wrap">
                  {di.description_resolution}
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Date de résolution</dt>
                  <dd>{formatDate(di.date_resolution)}</dd>
                </dl>
                {!isResolved && (
                  <p className="text-muted-foreground italic">
                    Demande réouverte : cette résolution est conservée à titre
                    d'historique.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <EmptyState
          icon={FileQuestion}
          title="Documents"
          description="À venir."
        />
      )}

      <DiResolveDialog
        key={resolveOpen ? 'open' : 'closed'}
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        diId={diId}
      />
    </div>
  )
}
