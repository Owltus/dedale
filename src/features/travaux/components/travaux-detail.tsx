import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ListChecks, ListPlus, Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { travauxQueries, statutsTravauxQueries } from '../queries'
import {
  useChangeStatutTravaux,
  useUpdateClotureTravaux,
  useCreateTache,
  useUpdateTache,
  useUpdateTacheStatut,
  useDeleteTache,
  useReordonnerTaches,
} from '../mutations'
import { STATUT_TERMINE } from '../schemas'
import type { TacheFormValues } from '@/features/equipements/tache-schema'
import { statutTravauxTone } from '../etat'
import { TravauxFormDialog } from './travaux-form-dialog'
import { ClotureDialog } from './cloture-dialog'
import { TacheDialog } from '@/features/equipements/components/tache-dialog'
import {
  TacheRow,
  type TacheItem,
} from '@/features/equipements/components/tache-row'
import { TachesDndContext } from '@/features/equipements/components/taches-dnd-context'
import { DocumentsFicheDropZone } from '@/features/equipements/components/documents-fiche-drop-zone'
import type { StatutZone } from '@/features/equipements/statut-zone'
import { useAuth } from '@/auth'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useDeplacerDocumentTache } from '@/features/documents/mutations'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusTransitionSelect } from '@/components/common/status-transition-select'
import { ProgressBar } from '@/components/common/progress-bar'
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
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const tachesQuery = useQuery(travauxQueries.taches(travaux.id))
  const change = useChangeStatutTravaux()
  const majCloture = useUpdateClotureTravaux()
  const createTache = useCreateTache()
  const updateTache = useUpdateTache()
  const changeTacheStatut = useUpdateTacheStatut()
  const delTache = useDeleteTache()
  const reordonnerTaches = useReordonnerTaches()
  const deplacerDoc = useDeplacerDocumentTache()
  // Ordre visuel affiché IMMÉDIATEMENT au dépôt, avant confirmation serveur
  // (mise à jour optimiste) ; effacé dès que la mutation aboutit ou échoue,
  // pour laisser reprendre la main aux données fraîches de la query.
  const [ordreOptimiste, setOrdreOptimiste] = useState<string[] | null>(null)
  // Tâches dans leur ordre AFFICHÉ, calculées ici (pas seulement dans le
  // rendu de `QueryState`) : le `TachesDndContext` doit envelopper AUSSI la
  // carte Documents (zone de dépôt pour détacher, étape 6), pas seulement la
  // liste de tâches — il lui faut donc `tacheIds` disponible en dehors du
  // `QueryState`.
  const rawTaches = tachesQuery.data ?? []
  const taches = ordreOptimiste
    ? ordreOptimiste
        .map((id) => rawTaches.find((t) => t.id === id))
        .filter((t): t is (typeof rawTaches)[number] => t != null)
    : rawTaches
  // Modale d'édition : useEntityDialog pour sa dialogKey, qui inclut l'état
  // d'ouverture. Une clé constante (key={travaux.id}) laissait react-hook-form
  // conserver son état d'un cycle à l'autre : une saisie annulée réapparaissait
  // à la réouverture.
  const editDialog = useEntityDialog<TravauxRow>()
  const [clotureOpen, setClotureOpen] = useState(false)
  // Modal de tâche : `entity` null = ajout, sinon édition de cette tâche.
  const tacheDialog = useEntityDialog<TacheItem>()
  const suppressionTache = useConfirmDelete<TacheItem>({
    onDelete: (t) => delTache.mutateAsync({ id: t.id, travauxId: travaux.id }),
    successMessage: 'Tâche retirée',
    // Suppression « métier » (trigger backend) → message d'écriture.
    errorMessage: writeErrorMessage,
  })

  async function submitTache(values: TacheFormValues) {
    if (tacheDialog.entity) {
      return updateTache.mutateAsync({
        id: tacheDialog.entity.id,
        travauxId: travaux.id,
        values,
      })
    }
    if (!session) throw new Error('Session expirée, reconnecte-toi.')
    return createTache.mutateAsync({
      travauxId: travaux.id,
      createdBy: session.user.id,
      values,
    })
  }

  function changeStatutTache(tacheId: string, next: StatutZone) {
    changeTacheStatut.mutate(
      { id: tacheId, travauxId: travaux.id, statut: next },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }
  // Upload + glisser-déposer pleine page (réservé aux rôles pouvant rattacher).
  const upload = useUploadDrop({ enabled: canManage })

  // 085 : statut libre, plus de verrouillage — un travaux Terminé reste
  // éditable (comme un événement Clôturé).
  const editable = canManage
  const tachesReadOnly = !canManage
  // Déjà terminé → le dialogue de clôture s'ouvre en CORRECTION (pré-rempli),
  // et non en clôture : le statut ne bouge pas, seules les colonnes de
  // clôture sont réécrites.
  const dejaTermine = travaux.statut_travaux_id === STATUT_TERMINE
  const realisees = taches.filter((t) => t.statut === 'realise').length

  function transition(statutId: number) {
    if (statutId === travaux.statut_travaux_id) return
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

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={travaux.titre}
        // Pas de description ici : la date de création vit dans la carte, en
        // regard de celle de clôture. La répéter donnerait deux endroits à
        // corriger pour une seule information (patron de la page Événements).
        breadcrumb={[
          {
            label: 'Travaux',
            onClick: () => void navigate({ to: '/travaux' }),
          },
        ]}
        titleBadges={
          <StatusTransitionSelect
            value={String(travaux.statut_travaux_id)}
            tone={statutTravauxTone(travaux.statut_travaux_id)}
            ariaLabel="Statut du travaux"
            disabled={!canManage || change.isPending}
            options={statuts.map((s) => ({
              value: String(s.id),
              label: s.nom,
            }))}
            onValueChange={(v) => transition(Number(v))}
          />
        }
        action={
          canManage ? (
            <>
              <TooltipIconButton
                icon={<Paperclip />}
                label="Rattacher un document"
                variant="outline"
                onClick={upload.openUploadEmpty}
              />
              {editable && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier le travaux"
                  variant="outline"
                  onClick={() => editDialog.openEdit(travaux)}
                />
              )}
            </>
          ) : undefined
        }
      />

      {/* LES DEUX BOUTS DU CHANTIER, CÔTE À CÔTE : ce qui était à faire à
          gauche, ce qui a été fait à droite. `lg:` et pas `md:` — à 768 px, deux
          colonnes de texte deviennent deux couloirs étroits ; en dessous tout se
          réempile dans l'ordre de lecture (mobile-first). */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* DEMANDE — toujours rendue, description vide comprise : sinon la date
            de création n'aurait plus d'endroit où vivre (elle était jusqu'ici
            dans l'en-tête de page). */}
        <DetailNoteCard
          // Tant qu'il n'y a pas de compte-rendu en face, la demande prend toute
          // la largeur : une carte à mi-largeur suivie d'un demi-écran vide se
          // lit comme un bloc manquant, pas comme une place réservée.
          className={dejaTermine ? undefined : 'lg:col-span-2'}
          label={`Créé le ${formatDate(travaux.date_demande)}`}
          text={travaux.description}
          emptyText="Aucune description."
          action={
            editable && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier le travaux"
                variant="ghost"
                onClick={() => editDialog.openEdit(travaux)}
              />
            )
          }
        />

        {/* CLÔTURE — apparaît dès que le travaux est TERMINÉ. Le libellé porte
            la date de fin : elle n'était affichée nulle part, alors que c'est
            l'information qu'on vient chercher une fois le chantier fini. Le
            crayon rouvre le dialogue en mode correction — seul point de la fiche
            qui reste actif sur un travaux verrouillé, une date ou un
            compte-rendu erroné devant pouvoir se rattraper. */}
        {travaux.statut_travaux_id === STATUT_TERMINE && (
          <DetailNoteCard
            label={`Terminé${travaux.date_fin ? ` le ${formatDate(travaux.date_fin)}` : ''}`}
            text={travaux.compte_rendu}
            emptyText="Aucun compte-rendu."
            action={
              canManage && (
                <TooltipIconButton
                  icon={<Pencil />}
                  label="Modifier la clôture"
                  variant="ghost"
                  onClick={() => setClotureOpen(true)}
                />
              )
            }
          />
        )}
      </div>

      {/* Zones concernées et Documents, EMPILÉES pleine largeur (décision PO :
          plus lisibles l'une sous l'autre que compressées à mi-largeur
          chacune). Hauteur naturelle, défilement de page normal — plus de
          calage de hauteur ni de défilement interne, devenus inutiles sans
          voisin à égaliser. */}
      <TachesDndContext
        tacheIds={taches.map((t) => t.id)}
        onReorder={(nextIds) => {
          setOrdreOptimiste(nextIds)
          reordonnerTaches.mutate(
            { travauxId: travaux.id, ids: nextIds },
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
            liaison: 'documents_interventions_travaux',
            parentColumn: 'travaux_id',
            parentId: travaux.id,
            documentId,
            tacheId,
          })
        }
        onDropDocumentOnFiche={(documentId) =>
          deplacerDoc.mutate({
            liaison: 'documents_interventions_travaux',
            parentColumn: 'travaux_id',
            parentId: travaux.id,
            documentId,
            tacheId: null,
          })
        }
      >
        <div className="flex flex-col gap-4">
          {/* TÂCHES — centre visuel de la fiche (090, étape 7) : la checklist
              porte désormais la progression visible, la frise de statut
              global n'a plus qu'un rôle discret en en-tête. */}
          <Card className="gap-3 py-4">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-base">
                  Tâches
                  {taches.length > 0 &&
                    ` (${String(realisees)}/${String(taches.length)} réalisées)`}
                </CardTitle>
                {taches.length > 0 && (
                  <ProgressBar
                    value={realisees / taches.length}
                    tone="success"
                    label="Progression des tâches"
                    className="mt-2"
                  />
                )}
              </div>
              {!tachesReadOnly && (
                <TooltipIconButton
                  icon={<ListPlus />}
                  label="Ajouter une tâche"
                  variant="outline"
                  onClick={() => tacheDialog.openCreate()}
                />
              )}
            </CardHeader>
            <CardContent>
              <QueryState
                query={tachesQuery}
                pending={
                  // Les tâches sont des LIGNES (h-14), pas une grille de cartes :
                  // `CardSkeletons` était détourné avec `container="flex flex-col"`
                  // pour le simuler. `size="sm"` = h-14, depuis MEDIA_HEIGHT.
                  <ListRowSkeletons count={3} size="sm" />
                }
                empty={
                  <EmptyState
                    icon={ListChecks}
                    title="Aucune tâche"
                    action={
                      !tachesReadOnly ? (
                        <Button
                          size="sm"
                          onClick={() => tacheDialog.openCreate()}
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
                    {taches.map((t) => (
                      <TacheRow
                        key={t.id}
                        tache={t}
                        readOnly={tachesReadOnly}
                        onEdit={() => tacheDialog.openEdit(t)}
                        onDelete={() => suppressionTache.demander(t)}
                        onChangeStatut={(next) => changeStatutTache(t.id, next)}
                        statutPending={changeTacheStatut.isPending}
                        sortable={!tachesReadOnly && taches.length > 1}
                        documents={{
                          liaison: 'documents_interventions_travaux',
                          parentColumn: 'travaux_id',
                          parentId: travaux.id,
                        }}
                      />
                    ))}
                  </div>
                )}
              </QueryState>
            </CardContent>
          </Card>

          {/* DOCUMENTS — une carte comme les autres, ET une zone de dépôt
              (091, étape 6) : glisser un document depuis une tâche jusqu'ici
              le détache (retour au niveau fiche). */}
          <DocumentsFicheDropZone>
            <Card className="relative gap-3 py-4">
              <CardHeader>
                <CardTitle className="text-base">Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentsTab
                  liaison="documents_interventions_travaux"
                  parentColumn="travaux_id"
                  parentId={travaux.id}
                  tacheId={null}
                  draggable
                  uploadOpen={upload.uploadOpen}
                  onUploadOpenChange={upload.onUploadOpenChange}
                  uploadInitialFiles={upload.droppedFiles}
                />
              </CardContent>
              <FileDropOverlay show={upload.dragging} />
            </Card>
          </DocumentsFicheDropZone>
        </div>
      </TachesDndContext>

      {editable && (
        <TravauxFormDialog
          key={editDialog.dialogKey}
          open={editDialog.open}
          onOpenChange={editDialog.onOpenChange}
          siteId={siteId}
          travaux={travaux}
        />
      )}

      {!tachesReadOnly && (
        <TacheDialog
          key={tacheDialog.dialogKey}
          open={tacheDialog.open}
          onOpenChange={tacheDialog.onOpenChange}
          siteId={siteId}
          tache={tacheDialog.entity}
          onSubmit={submitTache}
          documents={{
            liaison: 'documents_interventions_travaux',
            parentColumn: 'travaux_id',
            parentId: travaux.id,
          }}
        />
      )}

      <ConfirmDialog
        {...suppressionTache.dialogProps}
        title="Retirer cette tâche ?"
        description={
          suppressionTache.toDelete
            ? `« ${suppressionTache.toDelete.libelle} » sera retirée de ce travaux.`
            : undefined
        }
        confirmLabel="Retirer"
        destructive
      />

      {/* Un seul dialogue pour clôturer ET corriger : `initial` absent = on
          clôture (transition de statut, le FRONT pose cloture_by — 085, plus
          de trigger serveur), présent = on corrige (UPDATE des seules
          colonnes de clôture, statut intact). */}
      <ClotureDialog
        key={clotureOpen ? 'open' : 'closed'}
        open={clotureOpen}
        onOpenChange={setClotureOpen}
        pending={change.isPending || majCloture.isPending}
        dateDemande={travaux.date_demande}
        initial={
          dejaTermine
            ? {
                date_fin: travaux.date_fin,
                compte_rendu: travaux.compte_rendu,
              }
            : undefined
        }
        onConfirm={({ date_fin, compte_rendu }) => {
          const onSuccess = () => {
            toast.success(dejaTermine ? 'Clôture modifiée' : 'Travaux clôturé')
            setClotureOpen(false)
          }
          const onError = (e: unknown) => toast.error(writeErrorMessage(e))
          if (dejaTermine) {
            majCloture.mutate(
              { id: travaux.id, dateFin: date_fin, compteRendu: compte_rendu },
              { onSuccess, onError },
            )
            return
          }
          change.mutate(
            {
              id: travaux.id,
              statutId: STATUT_TERMINE,
              compteRendu: compte_rendu,
              dateFin: date_fin,
              clotureBy: session?.user.id,
            },
            { onSuccess, onError },
          )
        }}
      />
    </PageContainer>
  )
}
