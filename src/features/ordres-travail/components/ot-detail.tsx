import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, FileText, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '../queries'
import { LIBELLES_STATUT_OT, estVerrouille, variantStatutOt } from '../schemas'
import { useChangerStatutOt, useReouvrirOt } from '../mutations'
import { OperationRow } from './operation-row'
import { MotifDialog } from './motif-dialog'
import { useAuth } from '@/auth'
import { errorMessage } from '@/lib/form'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DocumentsTab } from '@/components/common/documents-tab'

interface OtDetailProps {
  otId: string
  canManage: boolean
  onBack: () => void
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('fr-FR') : '—'
}

type Onglet = 'operations' | 'documents'

export function OtDetail({ otId, canManage, onBack }: OtDetailProps) {
  const { session } = useAuth()
  const {
    data: ot,
    isPending,
    isError,
    refetch,
  } = useQuery(ordresTravailQueries.detail(otId))
  const operationsQuery = useQuery(ordresTravailQueries.operations(otId))

  const changerStatut = useChangerStatutOt()
  const reouvrir = useReouvrirOt()

  const [onglet, setOnglet] = useState<Onglet>('operations')
  const [clotureOpen, setClotureOpen] = useState(false)
  const [annulerOpen, setAnnulerOpen] = useState(false)
  const [reouvrirOpen, setReouvrirOpen] = useState(false)

  if (isPending) return <Skeleton className="h-96" />
  if (isError) return <ErrorState onRetry={() => void refetch()} />
  if (!ot) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="OT introuvable"
        description="Cet ordre de travail n'existe plus ou n'est pas accessible."
        action={
          <Button onClick={onBack} variant="outline">
            Retour
          </Button>
        }
      />
    )
  }

  const verrouille = estVerrouille(ot.statut)
  // Lecture seule des opérations dès que l'OT est terminal (cloture/annule)
  // ou sans session valide (executed_by requis à la saisie).
  const opsReadOnly = !canManage || verrouille || !session

  function cloturer() {
    changerStatut.mutate(
      { id: otId, statut: 'cloture' },
      {
        onSuccess: () => {
          toast.success('OT clôturé')
          setClotureOpen(false)
        },
        onError: (e) => {
          // Transition refusée (ops non terminées, etc.) → message backend.
          toast.error(errorMessage(e))
          setClotureOpen(false)
        },
      },
    )
  }

  function reactiver() {
    // Résurrection annule → planifie (refresh snapshots + régénère ops côté DB).
    changerStatut.mutate(
      { id: otId, statut: 'planifie' },
      {
        onSuccess: () => toast.success('OT réactivé'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  function annuler(motif: string) {
    changerStatut.mutate(
      { id: otId, statut: 'annule', motifAnnulation: motif },
      {
        onSuccess: () => {
          toast.success('OT annulé')
          setAnnulerOpen(false)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  function handleReouvrir(motif: string) {
    reouvrir.mutate(
      { id: otId, motif },
      {
        onSuccess: () => {
          toast.success('OT rouvert')
          setReouvrirOpen(false)
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  // Actions de statut visibles selon le statut courant (cf. machine à états).
  const actions: React.ReactNode[] = []
  if (canManage) {
    if (
      ot.statut === 'planifie' ||
      ot.statut === 'en_cours' ||
      ot.statut === 'reouvert'
    ) {
      actions.push(
        <Button
          key="cloturer"
          size="sm"
          disabled={changerStatut.isPending}
          onClick={() => setClotureOpen(true)}
        >
          Clôturer
        </Button>,
        <Button
          key="annuler"
          size="sm"
          variant="destructive"
          disabled={changerStatut.isPending}
          onClick={() => setAnnulerOpen(true)}
        >
          Annuler
        </Button>,
      )
    }
    if (ot.statut === 'cloture') {
      actions.push(
        <Button
          key="reouvrir"
          size="sm"
          variant="outline"
          disabled={reouvrir.isPending}
          onClick={() => setReouvrirOpen(true)}
        >
          Réouvrir
        </Button>,
      )
    }
    if (ot.statut === 'annule') {
      actions.push(
        <Button
          key="reactiver"
          size="sm"
          variant="outline"
          disabled={changerStatut.isPending}
          onClick={reactiver}
        >
          Réactiver
        </Button>,
      )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" className="self-start" onClick={onBack}>
        <ArrowLeft /> Retour
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>{ot.nom_gamme}</CardTitle>
            <Badge variant={variantStatutOt(ot.statut)} className="shrink-0">
              {LIBELLES_STATUT_OT[ot.statut] ?? ot.statut}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {ot.description_gamme && (
            <p className="text-muted-foreground whitespace-pre-wrap">
              {ot.description_gamme}
            </p>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">Prestataire</dt>
            <dd>{ot.nom_prestataire}</dd>
            <dt className="text-muted-foreground">Équipement</dt>
            <dd>{ot.nom_equipement ?? '—'}</dd>
            <dt className="text-muted-foreground">Localisation</dt>
            <dd>{ot.nom_localisation ?? '—'}</dd>
            <dt className="text-muted-foreground">Périodicité</dt>
            <dd>{ot.libelle_periodicite}</dd>
            <dt className="text-muted-foreground">Date prévue</dt>
            <dd>{formatDate(ot.date_prevue)}</dd>
            <dt className="text-muted-foreground">Date de début</dt>
            <dd>{formatDate(ot.date_debut)}</dd>
            <dt className="text-muted-foreground">Date de clôture</dt>
            <dd>{formatDate(ot.date_cloture)}</dd>
          </dl>

          {ot.motif_annulation && (
            <p className="text-sm">
              <span className="text-muted-foreground">
                Motif d'annulation :{' '}
              </span>
              {ot.motif_annulation}
            </p>
          )}
          {ot.motif_reouverture && (
            <p className="text-sm">
              <span className="text-muted-foreground">
                Motif de réouverture :{' '}
              </span>
              {ot.motif_reouverture}
            </p>
          )}

          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t pt-3">{actions}</div>
          )}
          {verrouille && (
            <p className="text-muted-foreground text-xs">
              OT {(LIBELLES_STATUT_OT[ot.statut] ?? ot.statut).toLowerCase()} —
              lecture seule (preuve légale).
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 border-b">
        <button
          type="button"
          onClick={() => setOnglet('operations')}
          className={`-mb-px flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${
            onglet === 'operations'
              ? 'border-primary text-foreground'
              : 'text-muted-foreground border-transparent'
          }`}
        >
          <ListChecks className="size-4" /> Opérations
        </button>
        <button
          type="button"
          onClick={() => setOnglet('documents')}
          className={`-mb-px flex items-center gap-1 border-b-2 px-3 py-2 text-sm ${
            onglet === 'documents'
              ? 'border-primary text-foreground'
              : 'text-muted-foreground border-transparent'
          }`}
        >
          <FileText className="size-4" /> Documents
        </button>
      </div>

      {onglet === 'operations' ? (
        operationsQuery.isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        ) : operationsQuery.isError ? (
          <ErrorState onRetry={() => void operationsQuery.refetch()} />
        ) : operationsQuery.data.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Aucune opération"
            description="Cet OT ne comporte aucune opération d'exécution."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {operationsQuery.data.map((op) => (
              <OperationRow
                key={op.id}
                operation={op}
                otId={otId}
                executedBy={session?.user.id ?? ''}
                readOnly={opsReadOnly}
              />
            ))}
          </div>
        )
      ) : (
        <DocumentsTab
          liaison="documents_ordres_travail"
          parentColumn="ordre_travail_id"
          parentId={otId}
        />
      )}

      <ConfirmDialog
        open={clotureOpen}
        onOpenChange={setClotureOpen}
        title="Clôturer l'ordre de travail ?"
        description="Toutes les opérations doivent être terminées ou non applicables. Un OT clôturé devient une preuve légale en lecture seule."
        confirmLabel="Clôturer"
        loading={changerStatut.isPending}
        onConfirm={cloturer}
      />

      <MotifDialog
        key={annulerOpen ? 'annuler-open' : 'annuler-closed'}
        open={annulerOpen}
        onOpenChange={setAnnulerOpen}
        title="Annuler l'ordre de travail"
        description="Indiquez le motif d'annulation (traçabilité obligatoire)."
        confirmLabel="Annuler l'OT"
        destructive
        pending={changerStatut.isPending}
        onConfirm={annuler}
      />

      <MotifDialog
        key={reouvrirOpen ? 'reouvrir-open' : 'reouvrir-closed'}
        open={reouvrirOpen}
        onOpenChange={setReouvrirOpen}
        title="Réouvrir l'ordre de travail"
        description="Indiquez le motif de réouverture (un OT clôturé est une preuve légale)."
        confirmLabel="Réouvrir"
        pending={reouvrir.isPending}
        onConfirm={handleReouvrir}
      />
    </div>
  )
}
