import { useQuery } from '@tanstack/react-query'
import { MapPinPlus, Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { evenementsQueries, statutsEvenementsQueries } from '../queries'
import { etapesEvenement } from '../etat'
import { STATUT_CLOTURE } from '../schemas'
import { useChangeStatutEvenement, useDeleteLieu } from '../mutations'
import { EvenementFormDialog } from './evenement-form-dialog'
import { ClotureEvenementDialog } from './cloture-evenement-dialog'
import { LieuDialog } from './lieu-dialog'
import { LieuRow, type LieuItem } from './lieu-row'
import { useAuth } from '@/auth'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { listStack } from '@/lib/responsive'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusStepper } from '@/components/common/status-stepper'
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
  const delLieu = useDeleteLieu()
  // Modal de lieu : `entity` null = ajout, sinon édition de ce lieu.
  const lieuDialog = useEntityDialog<LieuItem>()
  const suppressionLieu = useConfirmDelete<LieuItem>({
    onDelete: (l) => delLieu.mutateAsync({ id: l.id, evenementId: ev.id }),
    successMessage: 'Lieu retiré',
  })

  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const etapes = etapesEvenement(ev.statut_evenement_id, noms)

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
            <>
              <TooltipIconButton
                icon={<Paperclip />}
                label="Rattacher un document"
                variant="outline"
                onClick={upload.openUploadEmpty}
              />
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l’événement"
                variant="outline"
                onClick={() => edit.openEdit(ev)}
              />
            </>
          ) : undefined
        }
      />

      {/* FRISE — seule à rester PLEINE LARGEUR : c'est le résumé de l'état, on
          la lit avant le détail, et l'étaler sur les deux colonnes garde ses
          pastilles lisibles (à mi-largeur, les libellés se chevauchent). */}
      {etapes && (
        <Card className="mb-4">
          <CardContent>
            <StatusStepper
              steps={etapes}
              disabled={change.isPending}
              onStepClick={
                canManage
                  ? (i) => {
                      const cible = etapes[i]
                      if (cible) changeStatut(cible.statutId)
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}

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
      <div className="flex flex-col gap-4">
        {/* Lieux concernés : locaux/équipements liés à l'événement (086). */}
        <Card className="gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Lieux concernés</CardTitle>
            {canManage && (
              <TooltipIconButton
                icon={<MapPinPlus />}
                label="Ajouter un lieu"
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
                  icon={MapPinPlus}
                  title="Aucun lieu concerné"
                  action={
                    canManage ? (
                      <Button size="sm" onClick={() => lieuDialog.openCreate()}>
                        <MapPinPlus /> Ajouter un lieu
                      </Button>
                    ) : undefined
                  }
                />
              }
            >
              {(lieux) => (
                <div className={listStack}>
                  {lieux.map((l) => (
                    <LieuRow
                      key={l.id}
                      lieu={l}
                      evenementId={ev.id}
                      readOnly={!canManage}
                      onEdit={() => lieuDialog.openEdit(l)}
                      onDelete={() => suppressionLieu.demander(l)}
                    />
                  ))}
                </div>
              )}
            </QueryState>
          </CardContent>
        </Card>

        {/* DOCUMENTS — une carte comme les autres. */}
        <Card className="relative gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentsTab
              liaison="documents_evenements"
              parentColumn="evenement_id"
              parentId={ev.id}
              uploadOpen={upload.uploadOpen}
              onUploadOpenChange={upload.onUploadOpenChange}
              uploadInitialFiles={upload.droppedFiles}
              uploadDefaultTypeNom="Constat"
            />
          </CardContent>
          <FileDropOverlay show={upload.dragging} />
        </Card>
      </div>

      {canManage && (
        <>
          <EvenementFormDialog
            key={edit.dialogKey}
            open={edit.open}
            onOpenChange={edit.onOpenChange}
            siteId={ev.site_id}
            evenement={edit.entity}
          />
          <LieuDialog
            key={lieuDialog.dialogKey}
            open={lieuDialog.open}
            onOpenChange={lieuDialog.onOpenChange}
            evenementId={ev.id}
            siteId={ev.site_id}
            lieu={lieuDialog.entity}
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
        title="Retirer ce lieu ?"
        description={
          suppressionLieu.toDelete
            ? `« ${suppressionLieu.toDelete.locaux?.nom ?? 'Ce lieu'} » sera retiré de cet événement.`
            : undefined
        }
        confirmLabel="Retirer"
        destructive
      />
    </PageContainer>
  )
}
