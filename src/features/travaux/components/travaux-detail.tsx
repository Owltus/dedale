import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
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
import {
  useChangeStatutTravaux,
  useUpdateClotureTravaux,
  useDeleteTache,
} from '../mutations'
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
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { useUploadDrop } from '@/hooks/use-upload-drop'
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
  const { data: statuts = [] } = useQuery(statutsTravauxQueries.list())
  const tachesQuery = useQuery(travauxQueries.taches(travaux.id))
  const change = useChangeStatutTravaux()
  const majCloture = useUpdateClotureTravaux()
  const delTache = useDeleteTache()
  // Modale d'édition : useEntityDialog pour sa dialogKey, qui inclut l'état
  // d'ouverture. Une clé constante (key={travaux.id}) laissait react-hook-form
  // conserver son état d'un cycle à l'autre : une saisie annulée réapparaissait
  // à la réouverture.
  const editDialog = useEntityDialog<TravauxRow>()
  const [clotureOpen, setClotureOpen] = useState(false)
  // Confirmations de transition de statut du travaux (ex. « Annuler »), toutes
  // derrière un unique ConfirmDialog.
  const confirmAction = useConfirmAction()
  // Modal de zone : `entity` null = ajout, sinon édition de cette zone.
  const tacheDialog = useEntityDialog<TacheItem>()
  const suppressionTache = useConfirmDelete<TacheItem>({
    onDelete: (t) => delTache.mutateAsync({ id: t.id, travauxId: travaux.id }),
    successMessage: 'Zone retirée',
    // Suppression « métier » (trigger backend) → message d'écriture.
    errorMessage: writeErrorMessage,
  })
  // Upload + glisser-déposer pleine page (réservé aux rôles pouvant rattacher).
  const upload = useUploadDrop({ enabled: canManage })

  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const etapes = etapesTravaux(travaux.statut_travaux_id, noms)
  const verrouille = estVerrouille(travaux.statut_travaux_id)
  // Déjà terminé → le dialogue de clôture s'ouvre en CORRECTION (pré-rempli),
  // et non en clôture : le statut ne bouge pas, seules les deux colonnes de
  // clôture sont réécrites.
  const dejaTermine = travaux.statut_travaux_id === STATUT_TERMINE
  const transitions = TRANSITIONS[travaux.statut_travaux_id] ?? []
  const editable = canManage && !verrouille
  const tachesReadOnly = !canManage || verrouille
  // « Annuler » (statut hors parcours de la frise) : proposé en top bar tant
  // que la transition vers Annulé est autorisée.
  const canAnnuler = canManage && transitions.includes(STATUT_ANNULE)
  // « Réactiver » : ramène un travaux Annulé vers « Ouvert » (résurrection).
  const canReactiver = canManage && travaux.statut_travaux_id === STATUT_ANNULE

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
              {canAnnuler && (
                <TooltipIconButton
                  icon={<Ban className="text-destructive" />}
                  label="Annuler le travaux"
                  variant="outline"
                  onClick={() =>
                    confirmAction.demander({
                      title: 'Annuler le travaux ?',
                      description:
                        'Le travaux passera au statut « Annulé ». Cette issue est terminale.',
                      confirmLabel: 'Annuler le travaux',
                      destructive: true,
                      run: () =>
                        change.mutateAsync({
                          id: travaux.id,
                          statutId: STATUT_ANNULE,
                        }),
                      successMessage: 'Travaux annulé',
                    })
                  }
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

      {/* FRISE — seule à rester PLEINE LARGEUR : c'est le résumé de l'état, on
          la lit avant le détail, et l'étaler sur les deux colonnes garde ses
          quatre pastilles lisibles. Les actionnables changent le statut au clic ;
          « Annuler » est en barre de titre. */}
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
                      if (cible) transition(cible.statutId)
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}

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

      {/* SECONDE LIGNE À DEUX COLONNES : les deux listes du chantier, côte à
          côte. Ce sont les mêmes rangées de même hauteur — les empiler faisait
          descendre les documents sous la ligne de flottaison alors que la moitié
          droite de l'écran était vide.

          Les deux cartes prennent leur hauteur NATURELLE : c'est la page qui
          défile. Contraintes à la hauteur restante sans zone de défilement, elles
          se réduisaient sous leur propre contenu et les rangées sortaient par le
          bas, posées sur le fond de page hors de toute bordure. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Zones concernées : locaux/équipements liés au travaux + statut. */}
        <Card className="gap-3 py-4">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-base">Zones concernées</CardTitle>
            {!tachesReadOnly && (
              <TooltipIconButton
                icon={<ListPlus />}
                label="Ajouter une zone"
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
                  title="Aucune zone concernée"
                  action={
                    !tachesReadOnly ? (
                      <Button
                        size="sm"
                        onClick={() => tacheDialog.openCreate()}
                      >
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
                      onEdit={() => tacheDialog.openEdit(t)}
                      onDelete={() => suppressionTache.demander(t)}
                    />
                  ))}
                </div>
              )}
            </QueryState>
          </CardContent>
        </Card>

        {/* DOCUMENTS — une carte comme les autres. La liste vivait jusqu'ici à nu
            sur le fond de page : elle ne se rattachait visuellement à rien et ne
            disait pas ce qu'elle était. */}
        <Card className="relative gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentsTab
              liaison="documents_interventions_travaux"
              parentColumn="travaux_id"
              parentId={travaux.id}
              uploadOpen={upload.uploadOpen}
              onUploadOpenChange={upload.onUploadOpenChange}
              uploadInitialFiles={upload.droppedFiles}
            />
          </CardContent>
          <FileDropOverlay show={upload.dragging} />
        </Card>
      </div>

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
          travauxId={travaux.id}
          siteId={siteId}
          tache={tacheDialog.entity}
        />
      )}

      <ConfirmDialog
        {...suppressionTache.dialogProps}
        title="Retirer cette zone ?"
        description={
          suppressionTache.toDelete
            ? `« ${suppressionTache.toDelete.locaux?.nom ?? 'Cette zone'} » sera retirée de ce travaux.`
            : undefined
        }
        confirmLabel="Retirer"
        destructive
      />

      {/* Un seul dialogue pour clôturer ET corriger : `initial` absent = on
          clôture (transition de statut, le trigger pose cloture_by), présent =
          on corrige (UPDATE des seules colonnes de clôture, statut intact). */}
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
            },
            { onSuccess, onError },
          )
        }}
      />

      {/* Unique dialog des transitions de statut du travaux (« Annuler »…). */}
      <ConfirmDialog {...confirmAction.dialogProps} />
    </PageContainer>
  )
}
