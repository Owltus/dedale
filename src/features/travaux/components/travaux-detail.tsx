import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ListChecks,
  ListPlus,
  Lock,
  Paperclip,
  Pencil,
  Unlock,
} from 'lucide-react'
import { toast } from 'sonner'
import { travauxQueries, statutsTravauxQueries } from '../queries'
import {
  useChangeStatutTravaux,
  useUpdateClotureTravaux,
  useToggleVerrouTravaux,
  useCreateTache,
  useUpdateTache,
  useUpdateTacheStatut,
  useUpdateTacheDate,
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
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { useDeplacerDocumentTache } from '@/features/documents/mutations'
import { documentsQueries } from '@/features/documents/queries'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { cn } from '@/lib/utils'
import { listStack } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusTransitionSelect } from '@/components/common/status-transition-select'
import { StatusBadge } from '@/components/common/status-badge'
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
  // 094 : le statut de la fiche peut désormais changer SANS mutation directe
  // sur `interventions_travaux` — le trigger `gestion_statut_travaux` le
  // recalcule depuis les tâches. Sans ce live refresh, la fiche affichée
  // restait périmée (statut manuel de la veille) tant qu'on ne rechargeait
  // pas la page. Même patron que `OtDetail`.
  useRealtimeRefresh('interventions_travaux', travauxQueries.all())
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const tachesQuery = useQuery(travauxQueries.taches(travaux.id))
  // Même clé/cache que la query interne de `DocumentsTab` (tacheId=null) —
  // sert uniquement à savoir si la carte "Documents" niveau fiche est VIDE,
  // pour la masquer quand la fiche est verrouillée (rien à y faire).
  const ficheDocsQuery = useQuery(
    documentsQueries.byEntity(
      'documents_interventions_travaux',
      'travaux_id',
      travaux.id,
      null,
    ),
  )
  const change = useChangeStatutTravaux()
  const majCloture = useUpdateClotureTravaux()
  const toggleVerrou = useToggleVerrouTravaux()
  const createTache = useCreateTache()
  const updateTache = useUpdateTache()
  const changeTacheStatut = useUpdateTacheStatut()
  const changeTacheDate = useUpdateTacheDate()
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

  function changeDateTache(tacheId: string, next: string) {
    changeTacheDate.mutate(
      { id: tacheId, travauxId: travaux.id, dateTache: next },
      {
        onSuccess: () => toast.success('Date mise à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }
  // 094 : le VERROU (posé à toute clôture, manuelle ou automatique) remplace
  // l'ancien commentaire « 085 : plus de verrouillage » — désormais un
  // travaux Terminé EST verrouillé, jusqu'à déverrouillage explicite.
  const editable = canManage && !travaux.verrouille
  const showCadenas = canManage && travaux.statut_travaux_id === STATUT_TERMINE
  // Upload + glisser-déposer pleine page — réservé aux rôles pouvant
  // rattacher, ET seulement si la fiche n'est pas verrouillée : verrouillé
  // veut dire verrouillé, pièces jointes comprises (retour utilisateur).
  const upload = useUploadDrop({ enabled: editable })
  // Avec des tâches, le statut se calcule tout seul (094, D1) — plus de
  // sélection manuelle possible, quel que soit le verrou.
  const statutDerive = travaux.taches_activees && taches.length > 0
  const tachesReadOnly = !canManage || travaux.verrouille
  // Fiche verrouillée + carte "Documents" (niveau fiche, PAS les documents
  // des tâches) vide → rien à y faire ni à y voir, on la masque entièrement
  // (retour utilisateur). `undefined` (requête pas encore résolue) ne compte
  // PAS comme vide : mieux vaut un instant la montrer que la faire clignoter.
  const ficheDocsVides = ficheDocsQuery.data?.length === 0
  const masquerCarteDocuments = travaux.verrouille && ficheDocsVides
  // « Déjà terminé » = clôture VRAIMENT enregistrée (date_fin posée) — pas
  // seulement le statut basculé par le trigger, qui laisse date_fin NULL en
  // attendant confirmation (cf. `attendConfirmationCloture` ci-dessous).
  const clotureConfirmee =
    travaux.statut_travaux_id === STATUT_TERMINE && travaux.date_fin !== null
  const attendConfirmationCloture =
    travaux.statut_travaux_id === STATUT_TERMINE && travaux.date_fin === null
  const realisees = taches.filter((t) => t.statut === 'realise').length

  // Ouvre la confirmation de clôture UNE FOIS par fiche fraîchement basculée
  // en Terminé par le trigger (ajustement pendant le rendu, pas un effet : on
  // compare à la dernière fiche vue plutôt que d'utiliser useEffect).
  const [clotureAutoVuePour, setClotureAutoVuePour] = useState<string | null>(
    null,
  )
  if (
    attendConfirmationCloture &&
    clotureAutoVuePour !== travaux.id &&
    !clotureOpen
  ) {
    setClotureAutoVuePour(travaux.id)
    setClotureOpen(true)
  }

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
        action={
          <>
            {editable && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier le travaux"
                variant="outline"
                onClick={() => editDialog.openEdit(travaux)}
              />
            )}
            {/* Statut + cadenas COLLÉS (un seul groupe visuel, coins internes
                carrés + bordures qui se chevauchent d'1 px) : retour
                utilisateur — le cadenas se lit comme une extension du
                statut, pas comme une action à part. Statut visible de TOUS
                les rôles (pas seulement `canManage`), lecture seule si non
                gérable ; menu déroulant UNIQUEMENT si un choix manuel a un
                sens (094 : sinon le statut se calcule tout seul depuis les
                tâches, ou la fiche est verrouillée) — sinon simple pastille,
                sans chevron, pour ne pas laisser croire à une action
                possible. */}
            <div className="flex shrink-0 items-center">
              {editable && !statutDerive ? (
                <StatusTransitionSelect
                  value={String(travaux.statut_travaux_id)}
                  tone={statutTravauxTone(travaux.statut_travaux_id)}
                  ariaLabel="Statut du travaux"
                  disabled={change.isPending}
                  options={statuts.map((s) => ({
                    value: String(s.id),
                    label: s.nom,
                  }))}
                  onValueChange={(v) => transition(Number(v))}
                  className={cn(
                    'h-9 w-auto gap-1.5 rounded-md px-3 text-sm font-medium shadow-xs',
                    showCadenas && 'rounded-r-none',
                  )}
                />
              ) : (
                <StatusBadge
                  tone={statutTravauxTone(travaux.statut_travaux_id)}
                  className={cn(
                    'h-9 rounded-md px-3 text-sm font-medium',
                    showCadenas && 'rounded-r-none',
                  )}
                >
                  {statuts.find((s) => s.id === travaux.statut_travaux_id)
                    ?.nom ?? '…'}
                </StatusBadge>
              )}
              {showCadenas && (
                <TooltipIconButton
                  icon={travaux.verrouille ? <Lock /> : <Unlock />}
                  label={
                    travaux.verrouille
                      ? 'Déverrouiller cette fiche'
                      : 'Verrouiller cette fiche'
                  }
                  variant="outline"
                  disabled={toggleVerrou.isPending}
                  className="-ml-px rounded-l-none"
                  onClick={() =>
                    toggleVerrou.mutate(
                      { id: travaux.id, verrouille: !travaux.verrouille },
                      {
                        onSuccess: () =>
                          toast.success(
                            travaux.verrouille
                              ? 'Fiche déverrouillée'
                              : 'Fiche verrouillée',
                          ),
                        onError: (e) => toast.error(writeErrorMessage(e)),
                      },
                    )
                  }
                />
              )}
            </div>
          </>
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
          className={
            travaux.statut_travaux_id === STATUT_TERMINE
              ? undefined
              : 'lg:col-span-2'
          }
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
            crayon rouvre le dialogue en mode correction — DÉSORMAIS bloqué
            tant que la fiche reste verrouillée (094) : le cadenas de la
            carte Tâches doit être levé en premier. */}
        {travaux.statut_travaux_id === STATUT_TERMINE && (
          <DetailNoteCard
            label={`Terminé${travaux.date_fin ? ` le ${formatDate(travaux.date_fin)}` : ''}`}
            text={travaux.compte_rendu}
            emptyText="Aucun compte-rendu."
            action={
              editable && (
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
              porte désormais la progression visible. Le statut global de la
              fiche vit dans la barre de titre (retour live sur clic —
              corrigé suite retour utilisateur), plus ici. 094 (D2) : la
              carte disparaît ENTIÈREMENT si les tâches sont désactivées sur
              cette fiche — pas même un état vide. Les tâches déjà
              enregistrées ne sont pas supprimées pour autant, seulement
              mises en sommeil. */}
          {travaux.taches_activees && (
            <Card className="gap-3 py-4">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  Tâches
                  {taches.length > 0 &&
                    ` (${String(realisees)}/${String(taches.length)} réalisées)`}
                </CardTitle>
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
                          onChangeStatut={(next) =>
                            changeStatutTache(t.id, next)
                          }
                          statutPending={changeTacheStatut.isPending}
                          onChangeDate={(next) => changeDateTache(t.id, next)}
                          datePending={changeTacheDate.isPending}
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
          )}

          {/* DOCUMENTS — une carte comme les autres, ET une zone de dépôt
              (091, étape 6) : glisser un document depuis une tâche jusqu'ici
              le détache (retour au niveau fiche). Masquée quand la fiche est
              verrouillée ET qu'elle est vide (rien à y faire ni à y voir) —
              les documents éventuels d'une tâche ne comptent pas, ils vivent
              dans leur propre mini-liste. */}
          {!masquerCarteDocuments && (
            <DocumentsFicheDropZone>
              <Card className="relative gap-3 py-4">
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">Documents</CardTitle>
                  {editable && (
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
                    liaison="documents_interventions_travaux"
                    parentColumn="travaux_id"
                    parentId={travaux.id}
                    tacheId={null}
                    canAttach={editable}
                    draggable
                    uploadOpen={upload.uploadOpen}
                    onUploadOpenChange={upload.onUploadOpenChange}
                    uploadInitialFiles={upload.droppedFiles}
                  />
                </CardContent>
                <FileDropOverlay show={upload.dragging} />
              </Card>
            </DocumentsFicheDropZone>
          )}
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
          clôture pour de bon (transition de statut, le FRONT pose
          cloture_by, ET verrouille la fiche — 094), présent = on corrige une
          clôture déjà confirmée (UPDATE des seules colonnes de clôture,
          statut et verrou intacts). 094 : `attendConfirmationCloture`
          (trigger auto-basculé, date_fin encore NULL) passe aussi par la
          branche clôture — c'est une clôture FRAÎCHE, pas une correction. */}
      <ClotureDialog
        key={clotureOpen ? 'open' : 'closed'}
        open={clotureOpen}
        onOpenChange={setClotureOpen}
        pending={change.isPending || majCloture.isPending}
        dateDemande={travaux.date_demande}
        initial={
          clotureConfirmee
            ? {
                date_fin: travaux.date_fin,
                compte_rendu: travaux.compte_rendu,
              }
            : undefined
        }
        onConfirm={({ date_fin, compte_rendu }) => {
          const onSuccess = () => {
            toast.success(
              clotureConfirmee ? 'Clôture modifiée' : 'Travaux clôturé',
            )
            setClotureOpen(false)
          }
          const onError = (e: unknown) => toast.error(writeErrorMessage(e))
          if (clotureConfirmee) {
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
