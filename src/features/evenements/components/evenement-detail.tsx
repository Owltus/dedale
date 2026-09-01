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
import { evenementsQueries, statutsEvenementsQueries } from '../queries'
import { statutEvenementTone } from '../etat'
import { STATUT_CLOTURE } from '../schemas'
import type { TacheFormValues } from '@/features/equipements/tache-schema'
import {
  useChangeStatutEvenement,
  useUpdateClotureEvenement,
  useToggleVerrouEvenement,
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

// 098 : `ev` vient de `evenementsQueries.list` (via `SlugDetailRoute`),
// désormais enrichi de `locaux`/`equipements` (lieu principal) — le type de
// table brut ne suffit plus pour lire `ev.locaux?.nom`. Même patron que
// `TacheItem` (`tache-row.tsx`).
type Evenement = Database['public']['Tables']['evenements']['Row'] & {
  locaux: { id: string; nom: string } | null
  equipements: { id: string; categories: { nom: string } | null } | null
}

export function EvenementDetail({
  evenement: ev,
  canManage,
}: {
  evenement: Evenement
  canManage: boolean
}) {
  const navigate = useNavigate()
  const { session } = useAuth()
  // 094 : le statut de la fiche peut désormais changer SANS mutation directe
  // sur `evenements` — le trigger `gestion_statut_evenement` le recalcule
  // depuis les tâches. Même patron que `travaux-detail.tsx`/`OtDetail`.
  useRealtimeRefresh('evenements', evenementsQueries.all())
  // 094 : verrouillé (clôture confirmée) → plus aucune édition tant que le
  // cadenas n'est pas levé.
  const editable = canManage && !ev.verrouille
  const showCadenas = canManage && ev.statut_evenement_id === STATUT_CLOTURE
  const edit = useEntityDialog<Evenement>()
  const cloture = useEntityDialog<Evenement>()
  // Upload + glisser-déposer pleine page — réservé aux rôles pouvant
  // rattacher, ET seulement si la fiche n'est pas verrouillée : verrouillé
  // veut dire verrouillé, pièces jointes comprises (retour utilisateur).
  const upload = useUploadDrop({ enabled: editable })
  const { data: statuts = [] } = useQuery(statutsEvenementsQueries.list())
  // Même clé/cache que la query interne de `DocumentsTab` (tacheId=null) —
  // sert uniquement à savoir si la carte "Documents" niveau fiche est VIDE,
  // pour la masquer quand la fiche est verrouillée (rien à y faire).
  const ficheDocsQuery = useQuery(
    documentsQueries.byEntity(
      'documents_evenements',
      'evenement_id',
      ev.id,
      null,
    ),
  )
  const lieuxQuery = useQuery(evenementsQueries.lieux(ev.id))
  const change = useChangeStatutEvenement()
  const majCloture = useUpdateClotureEvenement()
  const toggleVerrou = useToggleVerrouEvenement()
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
    // Suppression « métier » (trigger backend) → message d'écriture. Même
    // patron que Travaux (travaux-detail.tsx) : cette table est pilotée par
    // le même trigger `gestion_statut_evenement`.
    errorMessage: writeErrorMessage,
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
  // Lieu principal (098) — sous le titre, à côté de la date de survenue (D5).
  const lieuPrincipalTexte = [
    ev.locaux?.nom,
    ev.equipements && (ev.equipements.categories?.nom ?? 'Équipement'),
  ]
    .filter(Boolean)
    .join(' · ')

  // 094 : avec des tâches, le statut se calcule tout seul — plus de choix
  // manuel. Le verrou (posé à toute clôture) bloque tout jusqu'au
  // déverrouillage explicite. 098/100 : plus de `taches_activees`, purement
  // dérivé du nombre de lignes.
  const statutDerive = lieux.length > 0
  const tachesReadOnly = !canManage || ev.verrouille
  // Fiche verrouillée + carte "Documents" (niveau fiche, PAS les documents
  // des tâches) vide → rien à y faire ni à y voir, on la masque entièrement
  // (retour utilisateur). `undefined` (requête pas encore résolue) ne compte
  // PAS comme vide : mieux vaut un instant la montrer que la faire clignoter.
  const ficheDocsVides = ficheDocsQuery.data?.length === 0
  const masquerCarteDocuments = ev.verrouille && ficheDocsVides
  // « Clôturé pour de bon » = date_cloture VRAIMENT posée — pas seulement le
  // statut basculé par le trigger, qui laisse date_cloture NULL en attendant
  // confirmation (cf. `attendConfirmationCloture`).
  const clotureConfirmee =
    ev.statut_evenement_id === STATUT_CLOTURE && ev.date_cloture !== null
  const attendConfirmationCloture =
    ev.statut_evenement_id === STATUT_CLOTURE && ev.date_cloture === null

  // Ouvre la confirmation de clôture UNE FOIS par fiche fraîchement basculée
  // en Clôturé par le trigger (ajustement pendant le rendu plutôt qu'un effet
  // — cf. le même patron sur TravauxDetail).
  const [clotureAutoVuePour, setClotureAutoVuePour] = useState<string | null>(
    null,
  )
  if (
    attendConfirmationCloture &&
    clotureAutoVuePour !== ev.id &&
    !cloture.open
  ) {
    setClotureAutoVuePour(ev.id)
    cloture.openEdit(ev)
  }

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
        breadcrumb={[
          {
            label: 'Événements',
            onClick: () => void navigate({ to: '/evenements' }),
          },
        ]}
        action={
          <>
            {editable && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l’événement"
                variant="outline"
                onClick={() => edit.openEdit(ev)}
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
                  value={String(ev.statut_evenement_id)}
                  tone={statutEvenementTone(ev.statut_evenement_id)}
                  ariaLabel="Statut de l'événement"
                  disabled={change.isPending}
                  options={statuts.map((s) => ({
                    value: String(s.id),
                    label: s.nom,
                  }))}
                  onValueChange={(v) => changeStatut(Number(v))}
                  className={cn(
                    'h-9 w-auto gap-1.5 rounded-md px-3 text-sm font-medium shadow-xs',
                    showCadenas && 'rounded-r-none',
                  )}
                />
              ) : (
                <StatusBadge
                  tone={statutEvenementTone(ev.statut_evenement_id)}
                  className={cn(
                    'h-9 rounded-md px-3 text-sm font-medium',
                    showCadenas && 'rounded-r-none',
                  )}
                >
                  {statuts.find((s) => s.id === ev.statut_evenement_id)?.nom ??
                    '…'}
                </StatusBadge>
              )}
              {showCadenas && (
                <TooltipIconButton
                  icon={ev.verrouille ? <Lock /> : <Unlock />}
                  label={
                    ev.verrouille
                      ? 'Déverrouiller cette fiche'
                      : 'Verrouiller cette fiche'
                  }
                  variant="outline"
                  disabled={toggleVerrou.isPending}
                  className="-ml-px rounded-l-none"
                  onClick={() =>
                    toggleVerrou.mutate(
                      { id: ev.id, verrouille: !ev.verrouille },
                      {
                        onSuccess: () =>
                          toast.success(
                            ev.verrouille
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
          label={
            lieuPrincipalTexte
              ? `${lieuPrincipalTexte} · Survenu le ${formatDate(ev.date_evenement)}`
              : `Survenu le ${formatDate(ev.date_evenement)}`
          }
          text={ev.description}
          emptyText="Aucun constat détaillé."
          action={
            editable && (
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
            en mode correction — DÉSORMAIS bloqué tant que la fiche reste
            verrouillée (094) : le cadenas de la carte Tâches doit être levé
            en premier. */}
        {ev.statut_evenement_id === STATUT_CLOTURE && (
          <DetailNoteCard
            label={`Clôturé${ev.date_cloture ? ` le ${formatDate(ev.date_cloture)}` : ''}`}
            text={ev.compte_rendu}
            emptyText="Aucun compte-rendu."
            action={
              editable && (
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
              que Travaux. Le statut global de la fiche vit dans la barre de
              titre (retour live sur clic — corrigé suite retour
              utilisateur), plus ici. 098/100 : plus de `taches_activees` — la
              carte apparaît dès qu'il y a au moins une tâche. */}
          {lieux.length > 0 && (
            <Card className="gap-3 py-4">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">
                  Tâches
                  {lieux.length > 0 &&
                    ` (${String(realisees)}/${String(lieux.length)} réalisées)`}
                </CardTitle>
                {!tachesReadOnly && (
                  <TooltipIconButton
                    icon={<ListPlus />}
                    label="Ajouter une tâche"
                    variant="outline"
                    onClick={() => lieuDialog.openCreate()}
                  />
                )}
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
                        !tachesReadOnly ? (
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
                          readOnly={tachesReadOnly}
                          onEdit={() => lieuDialog.openEdit(l)}
                          onDelete={() => suppressionLieu.demander(l)}
                          onChangeStatut={(next) =>
                            changeStatutLieu(l.id, next)
                          }
                          statutPending={changeLieuStatut.isPending}
                          onChangeDate={(next) => changeDateLieu(l.id, next)}
                          datePending={changeLieuDate.isPending}
                          sortable={!tachesReadOnly && lieux.length > 1}
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
          )}

          {/* DOCUMENTS — une carte comme les autres, ET une zone de dépôt
              (091, étape 6) : glisser un document depuis un lieu jusqu'ici le
              détache (retour au niveau fiche). Masquée quand la fiche est
              verrouillée ET qu'elle est vide (rien à y faire ni à y voir) —
              les documents éventuels d'un lieu ne comptent pas, ils vivent
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
                    liaison="documents_evenements"
                    parentColumn="evenement_id"
                    parentId={ev.id}
                    tacheId={null}
                    canAttach={editable}
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
          )}
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
            pending={change.isPending || majCloture.isPending}
            dateEvenement={ev.date_evenement}
            // Clôture VRAIMENT enregistrée (date_cloture posée) → le
            // dialogue s'ouvre pré-rempli, en correction. 094 :
            // `attendConfirmationCloture` (trigger auto-basculé, date_cloture
            // encore NULL) passe par la branche clôture FRAÎCHE, pas correction.
            initial={
              clotureConfirmee
                ? {
                    date_cloture: ev.date_cloture,
                    compte_rendu: ev.compte_rendu,
                  }
                : undefined
            }
            onConfirm={({ date_cloture, compte_rendu }) => {
              const onSuccess = () => {
                // Le message dit ce qui vient de se passer : on ne clôture
                // pas deux fois le même événement.
                toast.success(
                  clotureConfirmee ? 'Clôture modifiée' : 'Événement clôturé',
                )
                cloture.onOpenChange(false)
              }
              const onError = (e: unknown) => toast.error(writeErrorMessage(e))
              // Correction d'une clôture déjà enregistrée → seules date/compte-
              // rendu bougent (statut, cloture_by, verrouille intacts) ; clôture
              // FRAÎCHE → transition de statut complète, comme aujourd'hui.
              // Même distinction que le patron Travaux (`useUpdateClotureTravaux`).
              if (clotureConfirmee) {
                majCloture.mutate(
                  {
                    id: ev.id,
                    dateCloture: date_cloture,
                    compteRendu: compte_rendu,
                  },
                  { onSuccess, onError },
                )
                return
              }
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
                { onSuccess, onError },
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
