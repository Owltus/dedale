import { useQuery } from '@tanstack/react-query'
import { MapPin, Package, Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { statutsEvenementsQueries } from '../queries'
import { etapesEvenement } from '../etat'
import { cheminLocal } from '../format'
import { STATUT_CLOTURE } from '../schemas'
import { useChangeStatutEvenement } from '../mutations'
import { EvenementFormDialog } from './evenement-form-dialog'
import { ClotureEvenementDialog } from './cloture-evenement-dialog'
import { MIME_PDF } from '@/features/documents/upload'
import { useAuth } from '@/auth'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Card, CardContent } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Evenement = Database['public']['Tables']['evenements']['Row'] & {
  locaux?: {
    id: string
    nom: string
    niveaux?: { id: string; nom: string; batiments?: { nom: string } | null }
  } | null
  equipements?: { id: string; nom: string } | null
}

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
  const change = useChangeStatutEvenement()

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

  // Où cela s'est produit — rendu seulement si renseigné, les deux étant
  // facultatifs. Un bloc vide vaut moins qu'un bloc absent. Le local est affiché
  // avec sa hiérarchie : « Stationnement » seul ne situe rien.
  const chemin = cheminLocal(ev.locaux)
  const lieu = [
    chemin ? { icone: MapPin, texte: chemin } : null,
    ev.equipements?.nom ? { icone: Package, texte: ev.equipements.nom } : null,
  ].filter((x) => x !== null)

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={ev.titre}
        // Pas de description ici : la date de l'événement vit dans la carte de
        // constat, en regard de celle de clôture. La répéter dans l'en-tête
        // donnerait deux endroits à mettre à jour pour une seule information.
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

      {lieu.length > 0 && (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {lieu.map(({ icone: Icone, texte }) => (
              <span key={texte} className="flex items-center gap-2">
                <Icone className="size-4 shrink-0 text-muted-foreground" />
                {texte}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      {/* CONSTAT — même gabarit que la carte de clôture plus bas : date en
          en-tête discret, texte en dessous, crayon à droite. Les deux bouts du
          cycle se lisent donc pareil, et la frise s'intercale entre eux.
          Toujours rendue, description vide comprise : sinon la date de
          l'événement n'aurait plus d'endroit où vivre. */}
      <Card className="mb-4">
        <CardContent className="flex items-start justify-between gap-3 text-sm">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              Survenu le {formatDate(ev.date_evenement)}
            </span>
            <p className="whitespace-pre-wrap">
              {ev.description?.trim() ? (
                ev.description
              ) : (
                <span className="text-muted-foreground">
                  Aucun constat détaillé.
                </span>
              )}
            </p>
          </div>
          {canManage && (
            <TooltipIconButton
              icon={<Pencil />}
              label="Modifier l’événement"
              variant="ghost"
              onClick={() => edit.openEdit(ev)}
            />
          )}
        </CardContent>
      </Card>

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

      {/* La carte apparaît dès que l'événement est CLÔTURÉ, même sans
          compte-rendu (il est facultatif) : sans elle, la date de clôture ne
          serait ni visible ni corrigible. Le bouton rouvre le même dialogue, en
          mode correction — c'est le seul endroit où l'on édite une clôture. */}
      {ev.statut_evenement_id === STATUT_CLOTURE && (
        <Card className="mb-4">
          <CardContent className="flex items-start justify-between gap-3 text-sm">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                Clôturé
                {ev.date_cloture ? ` le ${formatDate(ev.date_cloture)}` : ''}
              </span>
              <p className="whitespace-pre-wrap">
                {ev.compte_rendu?.trim() ? (
                  ev.compte_rendu
                ) : (
                  <span className="text-muted-foreground">
                    Aucun compte-rendu.
                  </span>
                )}
              </p>
            </div>
            {canManage && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier la clôture"
                variant="ghost"
                onClick={() => cloture.openEdit(ev)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Zone documents : prend EXACTEMENT l'espace restant (flex-1). */}
      <div className="relative flex-1">
        <DocumentsTab
          liaison="documents_evenements"
          parentColumn="evenement_id"
          parentId={ev.id}
          acceptedMimes={MIME_PDF}
          uploadOpen={upload.uploadOpen}
          onUploadOpenChange={upload.onUploadOpenChange}
          uploadInitialFiles={upload.droppedFiles}
          uploadDefaultTypeNom="Constat"
          className="min-h-0 flex-1"
        />
        {canManage && <FileDropOverlay show={upload.dragging} />}
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
    </PageContainer>
  )
}
