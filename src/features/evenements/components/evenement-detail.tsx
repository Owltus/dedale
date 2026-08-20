import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ListChecks, ListPlus, Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { evenementsQueries, statutsEvenementsQueries } from '../queries'
import { statutEvenementTone } from '../etat'
import { STATUT_CLOTURE } from '../schemas'
import type { TacheFormValues } from '@/features/equipements/tache-schema'
import {
  useChangeStatutEvenement,
  useCreateLieu,
  useUpdateLieu,
  useUpdateLieuStatut,
  useUpdateLieuDate,
  useDeleteLieu,
  useReordonnerLieux,
} from '../mutations'
import { EvenementFormDialog } from './evenement-form-dialog'
import { ClotureEvenementDialog } from './cloture-evenement-dialog'
import { TacheDialog } from '@/features/equipements/components/tache-dialog'
import {
  TacheRow,
  type TacheItem,
} from '@/features/equipements/components/tache-row'
import { TachesDndContext } from '@/features/equipements/components/taches-dnd-context'
import { DocumentsFicheDropZone } from '@/features/equipements/components/documents-fiche-drop-zone'
import type { StatutZone } from '@/features/equipements/statut-zone'
import { useAuth } from '@/auth'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useDeplacerDocumentTache } from '@/features/documents/mutations'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusTransitionSelect } from '@/components/common/status-transition-select'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { DetailNoteCard } from '@/components/common/detail-note-card'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Evenement = Database['public']['Tables']['evenements']['Row']

export function EvenementDetail({
  evenement: ev,
  canManage,
  onBack,
}: {
  evenement: Evenement
  canManage: boolean
  onBack: () => void
}) {
  const { session } = useAuth()
  const edit = useEntityDialog<Evenement>()
  const cloture = useEntityDialog<Evenement>()
  const upload = useUploadDrop({ enabled: canManage })
  const { data: statuts = [] } = useQuery(statutsEvenementsQueries.list())
  const lieuxQuery = useQuery(evenementsQueries.lieux(ev.id))
  const change = useChangeStatutEvenement()
  const createLieu = useCreateLieu()
  const updateLieu = useUpdateLieu()
  const changeLieuStatut = useUpdateLieuStatut()
  const changeLieuDate = useUpdateLieuDate()
  const delLieu = useDeleteLieu()
  const reordonnerLieux = useReordonnerLieux()
  const deplacerDoc = useDeplacerDocumentTache()
  const [ordreOptimiste, setOrdreOptimiste] = useState<string[] | null>(null)
  // Lieux dans leur ordre AFFICHÉ, calculés ici (pas seulement dans le rendu
  // de `QueryState`) : le `TachesDndContext` doit envelopper AUSSI la carte
  // Documents (zone de dépôt pour détacher, étape 6), pas seulement la liste.
  const rawLieux = lieuxQuery.data ?? []
  const lieux = ordreOptimiste
    ? ordreOptimiste
        .map((id) => rawLieux.find((l) => l.id === id))
        .filter((l): l is (typeof rawLieux)[number] => l != null)
    : rawLieux
  // Modal de tâche : `entity` null = ajout, sinon édition de cette tâche.
  const lieuDialog = useEntityDialog<TacheItem>()
  const suppressionLieu = useConfirmDelete<TacheItem>({
    onDelete: (l) => delLieu.mutateAsync({ id: l.id, evenementId: ev.id }),
    successMessage: 'Tâche retirée',
  })

  async function submitLieu(values: TacheFormValues) {
    if (lieuDialog.entity) {
      return updateLieu.mutateAsync({
        id: lieuDialog.entity.id,
        evenementId: ev.id,
        values,
      })
    }
    if (!session) throw new Error('Session expirée, reconnecte-toi.')
    return createLieu.mutateAsync({
      evenementId: ev.id,
      createdBy: session.user.id,
      values,
    })
  }

  function changeStatutLieu(lieuId: string, next: StatutZone) {
    changeLieuStatut.mutate(
      { id: lieuId, evenementId: ev.id, statut: next },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  function changeDateLieu(lieuId: string, next: string) {
    changeLieuDate.mutate(
      { id: lieuId, evenementId: ev.id, dateTache: next },
      {
        onSuccess: () => toast.success('Date mise à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  const realisees = lieux.filter((l) => l.statut === 'realise').length

  /**
   * Clôturer passe par un dialogue (compte-rendu) ; tout autre statut est
   * immédiat. Le cycle étant libre, on peut rouvrir un événement clos — la
   * mutation efface alors la date et le compte-rendu de clôture.
   */
  function changeStatut(statutId: number) {
    if (statutId === ev.statut_evenement_id) return
    if (statutId === STATUT_CLOTURE) {
      cloture.openEdit(ev)
      return
    }
    change.mutate(
      { id: ev.id, statutId },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={ev.titre}
        breadcrumb={[{ label: 'Événements', onClick: onBack }]}
        action={
          canManage ? (
            <TooltipIconButton
              icon={<Pencil />}
              label="Modifier l’événement"
              variant="outline"
              onClick={() => edit.openEdit(ev)}
            />
          ) : undefined
        }
      />

      {/* LES DEUX BOUTS DU DOSSIER, CÔTE À CÔTE : ce qui a été constaté à
          gauche, ce qui a été fait à droite. Ils se répondent, on les compare
          d'un regard. `lg:` et pas `md:` — à 768 px, deux colonnes de texte
          deviennent deux couloirs étroits ; en dessous tout se réempile dans
          l'ordre de lecture (mobile-first). */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* CONSTAT — toujours rendu, description vide comprise : sinon la date
            de l'événement n'aurait plus d'endroit où vivre. */}
        <DetailNoteCard
          // Tant qu'il n'y a pas de clôture en face, le constat prend toute la
          // largeur : une carte à mi-largeur suivie d'un demi-écran vide se lit
          // comme un bloc manquant, pas comme une place réservée.
          className={
            ev.statut_evenement_id === STATUT_CLOTURE
              ? undefined
              : 'lg:col-span-2'
          }
          label={`Survenu le ${formatDate(ev.date_evenement)}`}
          text={ev.description}
          emptyText="Aucun constat détaillé."
          action={
            canManage && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l’événement"
                variant="ghost"
                onClick={() => edit.openEdit(ev)}
              />
            )
          }
        />

        {/* La carte apparaît dès que l'événement est CLÔTURÉ, même sans
            compte-rendu (il est facultatif) : sans elle, la date de clôture ne
            serait ni visible ni corrigible. Le bouton rouvre le même dialogue,
            en mode correction — seul endroit où l'on édite une clôture. */}
        {ev.statut_evenement_id === STATUT_CLOTURE && (
          <DetailNoteCard
            label={`Clôturé${ev.date_cloture ? ` le ${formatDate(ev.date_cloture)}` : ''}`}
            text={ev.compte_rendu}
            emptyText="Aucun compte-rendu."
            action={
              canManage && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier la clôture"
                  variant="ghost"
                  onClick={() => cloture.openEdit(ev)}
                />
              )
            }
          />
        )}
      </div>

      {/* Lieux concernés et Documents, EMPILÉS pleine largeur (décision PO,
          même patron que Travaux) : hauteur naturelle, défilement de page
          normal. */}
      <TachesDndContext
        tacheIds={lieux.map((l) => l.id)}
        onReorder={(nextIds) => {
          setOrdreOptimiste(nextIds)
          reordonnerLieux.mutate(
            { evenementId: ev.id, ids: nextIds },
            {
              onSuccess: () => setOrdreOptimiste(null),
              onError: (e) => {
                setOrdreOptimiste(null)
                toast.error(writeErrorMessage(e))
              },
            },
          )
        }}
        onDropDocumentOnTache={(documentId, tacheId) =>
          deplacerDoc.mutate({
            liaison: 'documents_evenements',
            parentColumn: 'evenement_id',
            parentId: ev.id,
            documentId,
            tacheId,
          })
        }
        onDropDocumentOnFiche={(documentId) =>
          deplacerDoc.mutate({
            liaison: 'documents_evenements',
            parentColumn: 'evenement_id',
            parentId: ev.id,
            documentId,
            tacheId: null,
          })
        }
      >
        <div className="flex flex-col gap-4">
          {/* TÂCHES — centre visuel de la fiche (090, étape 7), même patron
              que Travaux. Le statut global de la fiche vit ICI, à côté
              (refonte UI, étape 6) — plus dans le titre. */}
          <Card className="gap-3 py-4">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                Tâches
                {lieux.length > 0 &&
                  ` (${String(realisees)}/${String(lieux.length)} réalisées)`}
              </CardTitle>
              <div className="flex shrink-0 items-center gap-2">
                <StatusTransitionSelect
                  value={String(ev.statut_evenement_id)}
                  tone={statutEvenementTone(ev.statut_evenement_id)}
                  ariaLabel="Statut de l'événement"
                  disabled={!canManage || change.isPending}
                  options={statuts.map((s) => ({
                    value: String(s.id),
                    label: s.nom,
                  }))}
                  onValueChange={(v) => changeStatut(Number(v))}
                />
                {canManage && (
                  <TooltipIconButton
                    icon={<ListPlus />}
                    label="Ajouter une tâche"
                    variant="outline"
                    onClick={() => lieuDialog.openCreate()}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <QueryState
                query={lieuxQuery}
                pending={<ListRowSkeletons count={3} size="sm" />}
                empty={
                  <EmptyState
                    icon={ListChecks}
                    title="Aucune tâche"
                    action={
                      canManage ? (
                        <Button
                          size="sm"
                          onClick={() => lieuDialog.openCreate()}
                        >
                          <ListPlus /> Ajouter une tâche
                        </Button>
                      ) : undefined
                    }
                  />
                }
              >
                {() => (
                  <div className={listStack}>
                    {lieux.map((l) => (
                      <TacheRow
                        key={l.id}
                        tache={l}
                        readOnly={!canManage}
                        onEdit={() => lieuDialog.openEdit(l)}
                        onDelete={() => suppressionLieu.demander(l)}
                        onChangeStatut={(next) => changeStatutLieu(l.id, next)}
                        statutPending={changeLieuStatut.isPending}
                        onChangeDate={(next) => changeDateLieu(l.id, next)}
                        datePending={changeLieuDate.isPending}
                        sortable={canManage && lieux.length > 1}
                        documents={{
                          liaison: 'documents_evenements',
                          parentColumn: 'evenement_id',
                          parentId: ev.id,
                        }}
                      />
                    ))}
                  </div>
                )}
              </QueryState>
            </CardContent>
          </Card>

          {/* DOCUMENTS — une carte comme les autres, ET une zone de dépôt
              (091, étape 6) : glisser un document depuis un lieu jusqu'ici le
              détache (retour au niveau fiche). */}
          <DocumentsFicheDropZone>
            <Card className="relative gap-3 py-4">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Documents</CardTitle>
                {canManage && (
                  <TooltipIconButton
                    icon={<Paperclip />}
                    label="Rattacher un document"
                    variant="outline"
                    onClick={upload.openUploadEmpty}
                  />
                )}
              </CardHeader>
              <CardContent>
                <DocumentsTab
                  liaison="documents_evenements"
                  parentColumn="evenement_id"
                  parentId={ev.id}
                  tacheId={null}
                  draggable
                  uploadOpen={upload.uploadOpen}
                  onUploadOpenChange={upload.onUploadOpenChange}
                  uploadInitialFiles={upload.droppedFiles}
                  uploadDefaultTypeNom="Constat"
                />
              </CardContent>
              <FileDropOverlay show={upload.dragging} />
            </Card>
          </DocumentsFicheDropZone>
        </div>
      </TachesDndContext>

      {canManage && (
        <>
          <EvenementFormDialog
            key={edit.dialogKey}
            open={edit.open}
            onOpenChange={edit.onOpenChange}
            siteId={ev.site_id}
            evenement={edit.entity}
          />
          <TacheDialog
            key={lieuDialog.dialogKey}
            open={lieuDialog.open}
            onOpenChange={lieuDialog.onOpenChange}
            siteId={ev.site_id}
            tache={lieuDialog.entity}
            onSubmit={submitLieu}
            documents={{
              liaison: 'documents_evenements',
              parentColumn: 'evenement_id',
              parentId: ev.id,
            }}
          />
          <ClotureEvenementDialog
            key={cloture.dialogKey}
            open={cloture.open}
            onOpenChange={cloture.onOpenChange}
            pending={change.isPending}
            dateEvenement={ev.date_evenement}
            // Déjà clôturé → le dialogue s'ouvre pré-rempli, en correction.
            initial={
              ev.statut_evenement_id === STATUT_CLOTURE
                ? {
                    date_cloture: ev.date_cloture,
                    compte_rendu: ev.compte_rendu,
                  }
                : undefined
            }
            onConfirm={({ date_cloture, compte_rendu }) => {
              change.mutate(
                {
                  id: ev.id,
                  statutId: STATUT_CLOTURE,
                  compteRendu: compte_rendu,
                  // Date NUE locale saisie par l'utilisateur : jamais
                  // `toISOString()`, qui décale d'un jour selon le fuseau
                  // (cf. 23514 des OT, migration 075).
                  dateCloture: date_cloture,
                  clotureBy: session?.user.id,
                },
                {
                  onSuccess: () => {
                    // Le message dit ce qui vient de se passer : on ne clôture
                    // pas deux fois le même événement.
                    toast.success(
                      ev.statut_evenement_id === STATUT_CLOTURE
                        ? 'Clôture modifiée'
                        : 'Événement clôturé',
                    )
                    cloture.onOpenChange(false)
                  },
                  onError: (e) => toast.error(writeErrorMessage(e)),
                },
              )
            }}
          />
        </>
      )}

      <ConfirmDialog
        {...suppressionLieu.dialogProps}
        title="Retirer cette tâche ?"
        description={
          suppressionLieu.toDelete
            ? `« ${suppressionLieu.toDelete.libelle} » sera retirée de cet événement.`
            : undefined
        }
        confirmLabel="Retirer"
        destructive
      />
    </PageContainer>
  )
}
