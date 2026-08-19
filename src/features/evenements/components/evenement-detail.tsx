import { useQuery } from '@tanstack/react-query'
import { Paperclip, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { statutsEvenementsQueries } from '../queries'
import { etapesEvenement } from '../etat'
import { cheminLocal } from '../format'
import { localisationsQueries } from '@/features/localisations/queries'
import { STATUT_CLOTURE } from '../schemas'
import { useChangeStatutEvenement } from '../mutations'
import { EvenementFormDialog } from './evenement-form-dialog'
import { ClotureEvenementDialog } from './cloture-evenement-dialog'
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
import { DetailNoteCard } from '@/components/common/detail-note-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  // Un seul bâtiment sur le site → inutile de le nommer dans chaque chemin.
  const { data: batiments = [] } = useQuery(
    localisationsQueries.batiments(ev.site_id),
  )
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

  /**
   * Où cela s'est produit, en SOUS-TEXTE de la barre de titre — la zone que les
   * autres fiches utilisent pour situer leur entité. Le lieu répond à « de quoi
   * parle-t-on ? », au même titre que le titre : il se lit donc avec lui, pas
   * dans le corps.
   *
   * Les deux segments sont facultatifs ; `undefined` si aucun n'est renseigné,
   * le `PageHeader` réserve alors sa ligne sans rien afficher.
   */
  const lieu =
    [cheminLocal(ev.locaux, batiments.length > 1), ev.equipements?.nom]
      .filter(Boolean)
      .join(' · ') || undefined

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={ev.titre}
        // Le LIEU en sous-texte : il situe l'événement au même titre que son
        // titre. La DATE, elle, reste dans la carte de constat, en regard de
        // celle de clôture — la répéter ici donnerait deux endroits à corriger
        // pour une seule information.
        description={lieu}
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

      {/* DOCUMENTS — une carte comme les autres, en pleine largeur sous les deux
          notes. La liste vivait jusqu'ici à nu sur le fond de page : elle ne se
          rattachait visuellement à rien et ne disait pas ce qu'elle était.

          Elle prend la hauteur RESTANTE de la fiche (`lg:flex-1`), pour que la
          page se déploie jusqu'en bas au lieu de laisser un vide sous les
          cartes. Son contenu défile À L'INTÉRIEUR (`overflow-y-auto` sur le
          `CardContent`) : c'est ce qui manquait à ma première version, où la
          carte était contrainte en hauteur sans zone défilante — elle se
          réduisait sous son propre contenu et les documents sortaient par le bas,
          hors de toute bordure. Sous `lg`, hauteur naturelle et défilement de
          page, comme le reste du mobile-first. */}
      <Card className="relative flex flex-col gap-3 py-4 lg:min-h-0 lg:flex-1">
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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
        {canManage && <FileDropOverlay show={upload.dragging} />}
      </Card>

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
