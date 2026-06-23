import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  CircleCheck,
  ClipboardList,
  FileText,
  ListChecks,
  Paperclip,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '../queries'
import { estVerrouille } from '../schemas'
import { useChangerStatutOt, useReouvrirOt } from '../mutations'
import { OperationRow } from './operation-row'
import { MotifDialog } from './motif-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { SubTabs } from '@/components/common/sub-tabs'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DocumentsTab } from '@/components/common/documents-tab'

interface OtDetailProps {
  otId: string
  canManage: boolean
  onBack: () => void
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
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const [onglet, setOnglet] = useState<Onglet>('operations')
  const [clotureOpen, setClotureOpen] = useState(false)
  const [annulerOpen, setAnnulerOpen] = useState(false)
  const [reouvrirOpen, setReouvrirOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="Ordre de travail" onBack={onBack} />
        <Skeleton className="h-96" />
      </PageContainer>
    )
  }
  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Ordre de travail" onBack={onBack} />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }
  if (!ot) {
    return (
      <PageContainer>
        <PageHeader title="OT introuvable" onBack={onBack} />
        <EmptyState
          icon={ClipboardList}
          title="OT introuvable"
          description="Cet ordre de travail n'existe plus ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  const verrouille = estVerrouille(ot.statut)
  // Lecture seule des opérations dès que l'OT est terminal (cloture/annule)
  // ou sans session valide (executed_by requis à la saisie).
  const opsReadOnly = !canManage || verrouille || !session
  // Vignette de la GAMME liée (l'OT en est issu) — l'image « en lien avec l'OT ».
  const gammeMiniatureId = ot.gammes?.miniature_id ?? null
  const statutActif =
    ot.statut === 'planifie' ||
    ot.statut === 'en_cours' ||
    ot.statut === 'reouvert'

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
          toast.error(writeErrorMessage(e))
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
        onError: (e) => toast.error(writeErrorMessage(e)),
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
        onError: (e) => toast.error(writeErrorMessage(e)),
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
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  // Top bar : actions en boutons ICÔNE + tooltip (TooltipIconButton, variant
  // outline) — même convention réutilisable que les autres fiches détail
  // (Travaux, gammes). Rattachement de document (onglet Documents) + actions de
  // statut selon la machine à états (logique de transitions inchangée).
  const headerActions = canManage ? (
    <>
      {onglet === 'documents' && (
        <TooltipIconButton
          icon={<Paperclip />}
          label="Rattacher un document"
          variant="outline"
          onClick={() => setUploadOpen(true)}
        />
      )}
      {statutActif && (
        <>
          <TooltipIconButton
            icon={<CircleCheck />}
            label="Clôturer l'OT"
            variant="outline"
            disabled={changerStatut.isPending}
            onClick={() => setClotureOpen(true)}
          />
          <TooltipIconButton
            icon={<Ban className="text-destructive" />}
            label="Annuler l'OT"
            variant="outline"
            disabled={changerStatut.isPending}
            onClick={() => setAnnulerOpen(true)}
          />
        </>
      )}
      {ot.statut === 'cloture' && (
        <TooltipIconButton
          icon={<RotateCcw />}
          label="Réouvrir l'OT"
          variant="outline"
          disabled={reouvrir.isPending}
          onClick={() => setReouvrirOpen(true)}
        />
      )}
      {ot.statut === 'annule' && (
        <TooltipIconButton
          icon={<RotateCcw />}
          label="Réactiver l'OT"
          variant="outline"
          disabled={changerStatut.isPending}
          onClick={reactiver}
        />
      )}
    </>
  ) : undefined

  return (
    // `no-scrollbar` : seule la zone de contenu (2e enfant) défile, barre masquée
    // — calque de la fiche gamme. L'en-tête (1er enfant : top bar + carte + onglets)
    // reste FIXE.
    <PageContainer className="no-scrollbar">
      <div>
        <PageHeader
          title={ot.nom_gamme}
          onBack={onBack}
          action={headerActions}
        />

        {/* Carte de l'ordre — pour l'instant SEULE la vignette de la gamme liée
            (autres infos à ajouter plus tard, comme la carte de la fiche gamme).
            Conteneur calqué sur la carte média de `ListRow`. */}
        <div className="bg-card mb-4 flex h-20 items-stretch overflow-hidden rounded-lg border">
          <div className="aspect-square h-full shrink-0">
            <MiniatureThumb
              url={urlOf(gammeMiniatureId)}
              fallback={<ClipboardList className="size-10" />}
              alt=""
              onError={refreshMiniatures}
              className="size-full rounded-none"
            />
          </div>
        </div>

        <SubTabs
          ariaLabel="Sections de l’ordre de travail"
          variant="segmented"
          value={onglet}
          onValueChange={setOnglet}
          items={[
            {
              id: 'operations',
              label: 'Opérations',
              icon: <ListChecks className="size-4" />,
            },
            {
              id: 'documents',
              label: 'Documents',
              icon: <FileText className="size-4" />,
            },
          ]}
        />
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
          <EmptyState icon={ListChecks} title="Aucune opération" />
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
          uploadOpen={uploadOpen}
          onUploadOpenChange={setUploadOpen}
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
    </PageContainer>
  )
}
