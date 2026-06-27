import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Ban,
  ListChecks,
  ListPlus,
  Paperclip,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { travauxQueries, statutsTravauxQueries } from '../queries'
import { useChangeStatutTravaux, useDeleteTache } from '../mutations'
import {
  STATUT_ANNULE,
  STATUT_OUVERT,
  STATUT_TERMINE,
  TRANSITIONS,
  estVerrouille,
} from '../schemas'
import { etapesTravaux } from '../etat'
import { TravauxFormDialog } from './travaux-form-dialog'
import { ClotureDialog } from './cloture-dialog'
import { TacheDialog } from './tache-dialog'
import { TacheRow, type TacheItem } from './tache-row'
import { useFileDrop } from '@/hooks/use-file-drop'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { CardSkeletons } from '@/components/common/card-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type TravauxRow = Database['public']['Tables']['interventions_travaux']['Row']

interface TravauxDetailProps {
  travaux: TravauxRow
  siteId: string
  canManage: boolean
}

export function TravauxDetail({
  travaux,
  siteId,
  canManage,
}: TravauxDetailProps) {
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const tachesQuery = useQuery(travauxQueries.taches(travaux.id))
  const change = useChangeStatutTravaux()
  const delTache = useDeleteTache()
  const [edit, setEdit] = useState(false)
  const [clotureOpen, setClotureOpen] = useState(false)
  const [annulerOpen, setAnnulerOpen] = useState(false)
  // Modal de zone : `tache` null = ajout, sinon édition de cette zone.
  const [tacheForm, setTacheForm] = useState<{
    open: boolean
    tache: TacheItem | null
  }>({ open: false, tache: null })
  const [tacheToDelete, setTacheToDelete] = useState<TacheItem | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer sur la page → pré-remplis dans le dialogue.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const etapes = etapesTravaux(travaux.statut_travaux_id, noms)
  const verrouille = estVerrouille(travaux.statut_travaux_id)
  const transitions = TRANSITIONS[travaux.statut_travaux_id] ?? []
  const editable = canManage && !verrouille
  const tachesReadOnly = !canManage || verrouille
  // « Annuler » (statut hors parcours de la frise) : proposé en top bar tant
  // que la transition vers Annulé est autorisée.
  const canAnnuler = canManage && transitions.includes(STATUT_ANNULE)
  // « Réactiver » : ramène un travaux Annulé vers « Ouvert » (résurrection).
  const canReactiver =
    canManage && travaux.statut_travaux_id === STATUT_ANNULE

  // Ouverture manuelle (bouton top bar) : aucun fichier pré-rempli.
  const openUploadEmpty = () => {
    setDroppedFiles([])
    setUploadOpen(true)
  }
  // Fermeture : on oublie les fichiers déposés pour repartir propre au coup suivant.
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }
  // Glisser-déposer sur TOUTE la page (réservé aux rôles pouvant rattacher).
  const { dragging } = useFileDrop({
    enabled: canManage,
    onFiles: (files) => {
      setDroppedFiles(files)
      setUploadOpen(true)
    },
  })

  function transition(statutId: number) {
    if (statutId === STATUT_TERMINE) {
      setClotureOpen(true)
      return
    }
    change.mutate(
      { id: travaux.id, statutId },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function confirmDeleteTache() {
    if (!tacheToDelete) return
    delTache.mutate(
      { id: tacheToDelete.id, travauxId: travaux.id },
      {
        onSuccess: () => {
          toast.success('Zone retirée')
          setTacheToDelete(null)
        },
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={travaux.titre}
        description={`Créé le ${formatDate(travaux.date_demande)}`}
        action={
          canManage ? (
            <>
              <TooltipIconButton
                icon={<Paperclip />}
                label="Rattacher un document"
                variant="outline"
                onClick={openUploadEmpty}
              />
              {editable && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier le travaux"
                  variant="outline"
                  onClick={() => setEdit(true)}
                />
              )}
              {canAnnuler && (
                <TooltipIconButton
                  icon={<Ban className="text-destructive" />}
                  label="Annuler le travaux"
                  variant="outline"
                  onClick={() => setAnnulerOpen(true)}
                />
              )}
              {canReactiver && (
                <TooltipIconButton
                  icon={<RotateCcw />}
                  label="Réactiver le travaux"
                  variant="outline"
                  disabled={change.isPending}
                  onClick={() =>
                    change.mutate(
                      { id: travaux.id, statutId: STATUT_OUVERT },
                      {
                        onSuccess: () => toast.success('Travaux réactivé'),
                        onError: (e) => toast.error(writeErrorMessage(e)),
                      },
                    )
                  }
                />
              )}
            </>
          ) : undefined
        }
      />

      {/* Description en tête (sans titre : le contenu parle de lui-même). */}
      {travaux.description?.trim() && (
        <Card className="mb-6">
          <CardContent className="text-sm whitespace-pre-wrap">
            {travaux.description}
          </CardContent>
        </Card>
      )}

      {/* Suivi : frise d'avancement. Les pastilles actionnables changent le
          statut directement (clic) ; « Annuler » est en barre de titre. */}
      {etapes && (
        <Card className="mb-6">
          <CardContent>
            <StatusStepper
              steps={etapes}
              disabled={change.isPending}
              onStepClick={
                canManage
                  ? (i) => {
                      const cible = etapes[i]
                      if (cible) transition(cible.statutId)
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Compte-rendu (présent une fois le travaux clôturé). */}
      {travaux.compte_rendu?.trim() && (
        <Card className="mb-6">
          <CardContent className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground text-xs">Compte-rendu</span>
            <p className="whitespace-pre-wrap">{travaux.compte_rendu}</p>
          </CardContent>
        </Card>
      )}

      {/* Zones concernées : locaux/équipements liés au travaux + statut. */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Zones concernées</CardTitle>
          {!tachesReadOnly && (
            <TooltipIconButton
              icon={<ListPlus />}
              label="Ajouter une zone"
              variant="outline"
              onClick={() => setTacheForm({ open: true, tache: null })}
            />
          )}
        </CardHeader>
        <CardContent>
          <QueryState
            query={tachesQuery}
            pending={
              <CardSkeletons
                count={3}
                height="h-14"
                container="flex flex-col gap-2"
              />
            }
            empty={
              <EmptyState
                icon={ListChecks}
                title="Aucune zone concernée"
                action={
                  !tachesReadOnly ? (
                    <Button size="sm" onClick={() => setTacheForm({ open: true, tache: null })}>
                      <ListPlus /> Ajouter une zone
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            {(taches) => (
              <div className={listStack}>
                {taches.map((t) => (
                  <TacheRow
                    key={t.id}
                    tache={t}
                    travauxId={travaux.id}
                    readOnly={tachesReadOnly}
                    onEdit={() => setTacheForm({ open: true, tache: t })}
                    onDelete={() => setTacheToDelete(t)}
                  />
                ))}
              </div>
            )}
          </QueryState>
        </CardContent>
      </Card>

      {/* Zone documents : prend l'espace restant (flex-1) → surface de dépôt
          pleine hauteur, mise en valeur en entier pendant le glisser-déposer. */}
      <div className="relative flex-1">
        <DocumentsTab
          liaison="documents_interventions_travaux"
          parentColumn="travaux_id"
          parentId={travaux.id}
          uploadOpen={uploadOpen}
          onUploadOpenChange={handleUploadOpenChange}
          uploadInitialFiles={droppedFiles}
        />
        <FileDropOverlay show={dragging} />
      </div>

      {editable && (
        <TravauxFormDialog
          key={travaux.id}
          open={edit}
          onOpenChange={setEdit}
          siteId={siteId}
          travaux={travaux}
        />
      )}

      {!tachesReadOnly && (
        <TacheDialog
          key={`${tacheForm.tache?.id ?? 'new'}-${String(tacheForm.open)}`}
          open={tacheForm.open}
          onOpenChange={(open) => setTacheForm((f) => ({ ...f, open }))}
          travauxId={travaux.id}
          siteId={siteId}
          tache={tacheForm.tache}
        />
      )}

      <ConfirmDialog
        open={tacheToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTacheToDelete(null)
        }}
        title="Retirer cette zone ?"
        description={
          tacheToDelete
            ? `« ${tacheToDelete.locaux?.nom ?? 'Cette zone'} » sera retirée de ce travaux.`
            : undefined
        }
        confirmLabel="Retirer"
        destructive
        loading={delTache.isPending}
        onConfirm={confirmDeleteTache}
      />

      <ClotureDialog
        key={clotureOpen ? 'open' : 'closed'}
        open={clotureOpen}
        onOpenChange={setClotureOpen}
        travauxId={travaux.id}
      />

      <ConfirmDialog
        open={annulerOpen}
        onOpenChange={setAnnulerOpen}
        title="Annuler le travaux ?"
        description="Le travaux passera au statut « Annulé ». Cette issue est terminale."
        confirmLabel="Annuler le travaux"
        destructive
        loading={change.isPending}
        onConfirm={() =>
          change.mutate(
            { id: travaux.id, statutId: STATUT_ANNULE },
            {
              onSuccess: () => {
                toast.success('Travaux annulé')
                setAnnulerOpen(false)
              },
              onError: (e) => toast.error(writeErrorMessage(e)),
            },
          )
        }
      />
    </PageContainer>
  )
}
