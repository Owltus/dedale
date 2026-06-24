import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  ClipboardList,
  FileText,
  ListChecks,
  Paperclip,
  RotateCcw,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'
import { ordresTravailQueries } from '../queries'
import { estVerrouille } from '../schemas'
import {
  useChangerStatutOt,
  useReouvrirOt,
  useUpdateOperationExecution,
} from '../mutations'
import {
  OperationRow,
  estMesureExecution,
  type OperationEdit,
} from './operation-row'
import { MotifDialog } from './motif-dialog'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useAuth } from '@/auth'
import { todayLocal } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { SubTabs } from '@/components/common/sub-tabs'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ErrorState } from '@/components/common/error-state'
import { EmptyState } from '@/components/common/empty-state'
import { DocumentsTab } from '@/components/common/documents-tab'

interface OtDetailProps {
  otId: string
  canManage: boolean
}

type Onglet = 'operations' | 'documents'

export function OtDetail({ otId, canManage }: OtDetailProps) {
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
  const updateOp = useUpdateOperationExecution()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  const [onglet, setOnglet] = useState<Onglet>('operations')
  const [annulerOpen, setAnnulerOpen] = useState(false)
  const [reouvrirOpen, setReouvrirOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Édition des opérations (clé = id) remontée ICI : un SEUL bouton « Enregistrer »
  // (top bar) sauvegarde toutes les opérations modifiées. La clôture de l'OT est
  // AUTOMATIQUE côté backend (trigger gestion_statut_ot) quand toutes les
  // opérations passent à un état terminal → pas de bouton « Clôturer » manuel.
  const [edits, setEdits] = useState<Record<string, OperationEdit>>({})
  const [savingOps, setSavingOps] = useState(false)

  if (isPending) {
    return (
      <PageContainer>
        <PageHeader title="Ordre de travail" />
        <Skeleton className="h-96" />
      </PageContainer>
    )
  }
  if (isError) {
    return (
      <PageContainer>
        <PageHeader title="Ordre de travail" />
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    )
  }
  if (!ot) {
    return (
      <PageContainer>
        <PageHeader title="OT introuvable" />
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
  const gammeMiniatureId = ot.gammes?.miniature_id ?? null
  const statutActif =
    ot.statut === 'planifie' ||
    ot.statut === 'en_cours' ||
    ot.statut === 'reouvert'

  const operations = operationsQuery.data ?? []
  const canEditOps = canManage && !verrouille && Boolean(session)

  // Valeurs « serveur » d'une opération (baseline de comparaison + valeur affichée
  // tant qu'elle n'a pas été éditée). Date par défaut = aujourd'hui si non exécutée.
  function baseEdit(op: (typeof operations)[number]): OperationEdit {
    return {
      statut: op.statut,
      valeur: op.valeur_mesuree !== null ? String(op.valeur_mesuree) : '',
      dateExec: op.date_execution ? op.date_execution.slice(0, 10) : todayLocal(),
    }
  }
  function opEdit(op: (typeof operations)[number]): OperationEdit {
    return edits[op.id] ?? baseEdit(op)
  }
  function isOpDirty(op: (typeof operations)[number]): boolean {
    const e = edits[op.id]
    if (!e) return false
    const b = baseEdit(op)
    return e.statut !== b.statut || e.valeur !== b.valeur || e.dateExec !== b.dateExec
  }
  const dirtyOps = operations.filter(isOpDirty)

  async function saveAllOps() {
    if (dirtyOps.length === 0) return
    // Garde : valeur mesurée non numérique → on bloque avant tout envoi.
    for (const op of dirtyOps) {
      const e = edits[op.id]!
      if (
        estMesureExecution(op) &&
        e.valeur.trim() !== '' &&
        Number.isNaN(Number(e.valeur))
      ) {
        toast.error(`Valeur mesurée invalide : ${op.nom}`)
        return
      }
    }
    setSavingOps(true)
    const results = await Promise.allSettled(
      dirtyOps.map((op) => {
        const e = edits[op.id]!
        const valeurMesuree =
          estMesureExecution(op) && e.valeur.trim() !== '' ? Number(e.valeur) : null
        return updateOp.mutateAsync({
          id: op.id,
          otId,
          statut: e.statut,
          valeurMesuree,
          // Date saisie (jour) → ISO ; le backend ajuste selon le statut.
          dateExecution: e.dateExec
            ? new Date(`${e.dateExec}T00:00:00`).toISOString()
            : null,
          executedBy: session?.user.id ?? '',
          commentaires: op.commentaires,
        })
      }),
    )
    setSavingOps(false)
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    )
    if (rejected.length === 0) {
      toast.success(
        dirtyOps.length > 1
          ? `${String(dirtyOps.length)} opérations enregistrées`
          : 'Opération enregistrée',
      )
      setEdits({})
    } else {
      toast.error(writeErrorMessage(rejected[0]!.reason))
    }
  }

  function reactiver() {
    // Résurrection annule → planifie (refresh snapshots + régénère ops côté DB).
    changerStatut.mutate(
      { id: otId, statut: 'planifie' },
      {
        onSuccess: () => {
          toast.success('OT réactivé')
          setEdits({})
        },
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

  // Top bar : actions en boutons ICÔNE + tooltip (TooltipIconButton, outline).
  // Onglet Opérations → un SEUL bouton « Enregistrer » (disquette) pour toutes les
  // opérations. Annuler / Réouvrir / Réactiver = transitions manuelles restantes
  // (la clôture, elle, est automatique côté backend).
  const headerActions = canManage ? (
    <>
      {onglet === 'operations' && canEditOps && (
        <TooltipIconButton
          icon={<Save />}
          label="Enregistrer les opérations"
          variant="outline"
          disabled={dirtyOps.length === 0 || savingOps}
          onClick={() => void saveAllOps()}
        />
      )}
      {onglet === 'documents' && (
        <TooltipIconButton
          icon={<Paperclip />}
          label="Rattacher un document"
          variant="outline"
          onClick={() => setUploadOpen(true)}
        />
      )}
      {statutActif && (
        <TooltipIconButton
          icon={<Ban className="text-destructive" />}
          label="Annuler l'OT"
          variant="outline"
          disabled={changerStatut.isPending}
          onClick={() => setAnnulerOpen(true)}
        />
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
    // `no-scrollbar` : seule la zone de contenu (2e enfant) défile, barre masquée.
    // L'en-tête (1er enfant : top bar + carte + onglets) reste FIXE.
    <PageContainer className="no-scrollbar">
      <div>
        <PageHeader title={ot.nom_gamme} action={headerActions} />

        {/* Carte de l'ordre — vignette de la gamme liée (autres infos plus tard). */}
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
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : operationsQuery.isError ? (
          <ErrorState onRetry={() => void operationsQuery.refetch()} />
        ) : operations.length === 0 ? (
          <EmptyState icon={ListChecks} title="Aucune opération" />
        ) : (
          <div className="flex flex-col gap-3">
            {operations.map((op) => (
              <OperationRow
                key={op.id}
                operation={op}
                value={opEdit(op)}
                onChange={(v) =>
                  setEdits((prev) => ({ ...prev, [op.id]: v }))
                }
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
