import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Hammer, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { chantiersQueries, statutsChantierQueries } from '../queries'
import { useChangeStatutChantier } from '../mutations'
import {
  STATUT_EN_COURS,
  STATUT_TERMINE,
  TRANSITIONS,
  estVerrouille,
} from '../schemas'
import { ChantierFormDialog } from './chantier-form-dialog'
import { ClotureDialog } from './cloture-dialog'
import { formatDate } from '@/lib/date'
import { errorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'

interface ChantierDetailProps {
  chantierId: string
  siteId: string
  canManage: boolean
  onBack: () => void
}

export function ChantierDetail({
  chantierId,
  siteId,
  canManage,
  onBack,
}: ChantierDetailProps) {
  const {
    data: chantier,
    isPending,
    isError,
    refetch,
  } = useQuery(chantiersQueries.detail(chantierId))
  const { data: statuts = [] } = useQuery(statutsChantierQueries.list())
  const { data: locaux = [] } = useQuery(chantiersQueries.locaux(chantierId))
  const { data: equipements = [] } = useQuery(
    chantiersQueries.equipements(chantierId),
  )
  const change = useChangeStatutChantier()
  const [editOpen, setEditOpen] = useState(false)
  const [clotureOpen, setClotureOpen] = useState(false)

  if (isPending) return <Skeleton className="h-96" />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!chantier) {
    return (
      <EmptyState
        icon={Hammer}
        title="Chantier introuvable"
        description="Ce chantier n'existe plus ou n'est pas accessible."
        action={
          <Button onClick={onBack} variant="outline">
            Retour
          </Button>
        }
      />
    )
  }

  const statutNom = new Map(statuts.map((s) => [s.id, s.nom]))
  const verrouille = estVerrouille(chantier.statut_chantier_id)
  const transitions = TRANSITIONS[chantier.statut_chantier_id] ?? []
  const editable = canManage && !verrouille

  function transition(statutId: number) {
    if (statutId === STATUT_TERMINE) {
      setClotureOpen(true)
      return
    }
    change.mutate(
      { id: chantierId, statutId },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Retour
        </Button>
        {editable && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil /> Modifier
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{chantier.titre}</CardTitle>
            <Badge variant="secondary" className="shrink-0">
              {statutNom.get(chantier.statut_chantier_id) ?? 'Statut'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {chantier.description && (
            <p className="text-muted-foreground whitespace-pre-wrap">
              {chantier.description}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Prestataire</dt>
            <dd>{chantier.prestataires?.libelle ?? '—'}</dd>
            <dt className="text-muted-foreground">Date de demande</dt>
            <dd>{formatDate(chantier.date_demande)}</dd>
            <dt className="text-muted-foreground">Date prévue</dt>
            <dd>{formatDate(chantier.date_prevue)}</dd>
            <dt className="text-muted-foreground">Date de fin</dt>
            <dd>{formatDate(chantier.date_fin)}</dd>
          </dl>

          {chantier.compte_rendu && (
            <div>
              <p className="text-muted-foreground mb-1 font-medium">
                Compte-rendu
              </p>
              <p className="whitespace-pre-wrap">{chantier.compte_rendu}</p>
            </div>
          )}

          {canManage && transitions.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <span className="text-muted-foreground self-center text-xs">
                Faire passer à :
              </span>
              {transitions.map((statutId) => (
                <Button
                  key={statutId}
                  size="sm"
                  variant={statutId === STATUT_TERMINE ? 'default' : 'outline'}
                  disabled={change.isPending}
                  onClick={() => transition(statutId)}
                >
                  {chantier.statut_chantier_id === STATUT_TERMINE &&
                  statutId === STATUT_EN_COURS
                    ? 'Rouvrir'
                    : (statutNom.get(statutId) ?? 'Statut')}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))] gap-4">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Locaux concernés</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {locaux.length === 0 ? (
              <p className="text-muted-foreground">Aucun local lié.</p>
            ) : (
              <ul className="list-disc pl-4">
                {locaux.map((l) => (
                  <li key={l.local_id}>{l.locaux.nom}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Équipements concernés</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {equipements.length === 0 ? (
              <p className="text-muted-foreground">Aucun équipement lié.</p>
            ) : (
              <ul className="list-disc pl-4">
                {equipements.map((e) => (
                  <li key={e.equipement_id}>{e.equipements.nom}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            À venir.
          </CardContent>
        </Card>
      </div>

      {editable && (
        <ChantierFormDialog
          key={chantier.id}
          open={editOpen}
          onOpenChange={setEditOpen}
          siteId={siteId}
          chantier={chantier}
        />
      )}

      <ClotureDialog
        key={clotureOpen ? 'open' : 'closed'}
        open={clotureOpen}
        onOpenChange={setClotureOpen}
        chantierId={chantierId}
      />
    </div>
  )
}
