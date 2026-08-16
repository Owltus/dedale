import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Ban, Paperclip, Pencil, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { statutsCapexQueries } from '@/features/investissements/queries'
import {
  etapesInvestissement,
  ID_CLOTURE,
  ID_REFUSE,
} from '@/features/investissements/etat'
import { useChangeStatutCapex } from '@/features/investissements/mutations'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { ClotureInvestissementDialog } from './cloture-investissement-dialog'
import { MIME_PDF } from '@/features/documents/upload'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { formatDate } from '@/lib/date'
import { useAuth } from '@/auth'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { cn } from '@/lib/utils'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { DetailNoteCard } from '@/components/common/detail-note-card'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export function InvestissementDetail({
  investissement: inv,
  siteId,
  canManage,
}: {
  investissement: Investissement
  siteId: string
  canManage: boolean
}) {
  const navigate = useNavigate()
  const edit = useEntityDialog<Investissement>()
  const cloture = useEntityDialog<Investissement>()
  const { session } = useAuth()
  const confirmAction = useConfirmAction<{ statutId: number }>()
  // Upload + glisser-déposer pleine page (réservé aux rôles pouvant rattacher).
  const upload = useUploadDrop({ enabled: canManage })
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const change = useChangeStatutCapex()
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const etapes = etapesInvestissement(inv.statut_capex_id, noms)

  const { label, depassement } = ecartCapex(inv)
  const ecartLabel = label ?? '—'
  // « Refuser » (statut hors parcours de la frise) : proposé en top bar tant que
  // l'investissement n'est pas déjà refusé. « Réactiver » fait l'inverse.
  const canRefuser = canManage && inv.statut_capex_id !== ID_REFUSE
  const canReactiver = canManage && inv.statut_capex_id === ID_REFUSE

  function changeStatut(statutId: number) {
    if (statutId === inv.statut_capex_id) return
    // Clôturer demande un bilan : on passe par le dialogue. Tout autre statut
    // est immédiat. Le cycle étant libre, on peut rouvrir un investissement
    // clos — la mutation efface alors date et bilan.
    if (statutId === ID_CLOTURE) {
      cloture.openEdit(inv)
      return
    }
    change.mutate(
      { id: inv.id, statutId },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <PageContainer className="flex flex-col">
      <PageHeader
        title={inv.libelle}
        // Pas de description ici : la date de demande vit dans la carte, en
        // regard de celle de clôture. La répéter donnerait deux endroits à
        // corriger pour une seule information (patron de la page Événements).
        breadcrumb={[
          {
            label: 'Investissements (CapEx)',
            onClick: () => void navigate({ to: '/investissements' }),
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
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l'investissement"
                variant="outline"
                onClick={() => edit.openEdit(inv)}
              />
              {canRefuser && (
                <TooltipIconButton
                  icon={<Ban className="text-destructive" />}
                  label="Refuser l'investissement"
                  variant="outline"
                  onClick={() =>
                    confirmAction.demander({
                      title: "Refuser l'investissement ?",
                      description:
                        "L'investissement passera au statut « Refusé ».",
                      confirmLabel: 'Refuser',
                      destructive: true,
                      param: { statutId: ID_REFUSE },
                      run: ({ statutId }) =>
                        change.mutateAsync({ id: inv.id, statutId }),
                      successMessage: 'Investissement refusé',
                    })
                  }
                />
              )}
              {canReactiver && (
                <TooltipIconButton
                  icon={<RotateCcw />}
                  label="Réactiver l'investissement"
                  variant="outline"
                  disabled={change.isPending}
                  onClick={() =>
                    change.mutate(
                      { id: inv.id, statutId: 1 },
                      {
                        onSuccess: () =>
                          toast.success('Investissement réactivé'),
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

      {/* Le budget descend en bas de fiche, à côté des documents (décision PO) :
          un montant réel se vérifie sur la facture d'à côté. Il reste dans une
          `Card` ordinaire et non `DetailHeaderCard` — cette brique est faite pour
          une entité ILLUSTRÉE (équipement, gamme, prestataire) ; un
          investissement n'a pas de vignette, on lui posait donc une icône de
          repli dans un carré de 80 px qui ne servait qu'à décaler son contenu. */}

      {/* FRISE — seule à rester PLEINE LARGEUR : c'est le résumé de l'état, on
          la lit avant le détail. Statut LIBRE → toute pastille est cliquable
          (positionne ce statut) ; « Refuser » est en barre de titre. */}
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

      {/* LES DEUX BOUTS DU DOSSIER, CÔTE À CÔTE : ce qui était demandé à gauche,
          ce qu'il en est advenu à droite. `lg:` et pas `md:` — à 768 px, deux
          colonnes de texte deviennent deux couloirs étroits ; en dessous tout se
          réempile dans l'ordre de lecture (mobile-first). */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* DEMANDE — toujours rendue, description vide comprise : sinon la date
            de demande n'aurait plus d'endroit où vivre. */}
        <DetailNoteCard
          label={`Demandé le ${formatDate(inv.date_demande)}`}
          text={inv.description}
          emptyText="Aucune description."
          action={
            canManage && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l'investissement"
                variant="ghost"
                onClick={() => edit.openEdit(inv)}
              />
            )
          }
        />

        {/* BILAN — rendu EN PERMANENCE, y compris avant la clôture : la fiche
            annonce ainsi les deux bouts de son cycle dès l'ouverture du dossier,
            au lieu de faire apparaître un bloc en fin de course. Le libellé dit
            alors « Clôture » (l'étape qui reste à venir) et non « Clôturé », qui
            serait faux ; le crayon n'apparaît qu'une fois la clôture faite —
            avant, on clôture par la frise. */}
        <DetailNoteCard
          label={
            inv.statut_capex_id === ID_CLOTURE
              ? `Clôturé${inv.date_cloture ? ` le ${formatDate(inv.date_cloture)}` : ''}`
              : 'Clôture'
          }
          text={inv.statut_capex_id === ID_CLOTURE ? inv.bilan : null}
          emptyText={
            inv.statut_capex_id === ID_CLOTURE
              ? 'Aucun bilan.'
              : 'Investissement non clôturé.'
          }
          action={
            canManage &&
            inv.statut_capex_id === ID_CLOTURE && (
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier la clôture"
                variant="ghost"
                onClick={() => cloture.openEdit(inv)}
              />
            )
          }
        />
      </div>

      {/* DERNIÈRE LIGNE À DEUX COLONNES : le budget à gauche, ses pièces
          justificatives à droite. Les deux se consultent ensemble — un montant
          réel se vérifie sur la facture d'à côté.

          Les quatre montants passent donc en 2 × 2 (Demandé / Prévu au-dessus,
          Réel / Écart en dessous) : à mi-largeur, quatre colonnes de montants
          auraient tronqué les libellés. Les quatre emplacements sont TOUJOURS
          rendus, « — » compris — sur un écran de suivi, un montant manquant est
          une information (contrairement à la liste, qui n'affiche que les
          montants renseignés).

          La ligne prend la hauteur RESTANTE de la fiche, pour que la page se
          déploie jusqu'en bas au lieu de laisser un vide sous les cartes, et les
          deux cartes font la MÊME hauteur (`stretch`, le défaut de la grille) —
          une carte courte à côté d'une longue était le « un coup petit, un coup
          grand » de cet écran. Sous `lg`, hauteur naturelle et défilement de
          page, comme le reste du mobile-first. */}
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2">
        <Card className="flex flex-col gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Budget</CardTitle>
          </CardHeader>
          <CardContent className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-x-6 gap-y-3 overflow-y-auto">
            {[
              { label: 'Demandé', value: formatEuros(inv.montant_demande) },
              { label: 'Prévu', value: formatEuros(inv.montant_prevu) },
              { label: 'Réel', value: formatEuros(inv.depense_reelle) },
              {
                label: 'Écart prévu / réel',
                value: ecartLabel,
                alerte: depassement,
              },
            ].map((m) => (
              <div key={m.label} className="min-w-0">
                <div className="truncate text-xs text-muted-foreground">
                  {m.label}
                </div>
                <div
                  className={cn(
                    'truncate font-medium tabular-nums',
                    m.alerte && 'text-warning',
                  )}
                >
                  {m.value}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* DOCUMENTS — une carte comme les autres. La liste vivait jusqu'ici à nu
            sur le fond de page : elle ne se rattachait visuellement à rien et ne
            disait pas ce qu'elle était. */}
        <Card className="relative flex flex-col gap-3 py-4">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            <DocumentsTab
              liaison="documents_investissements"
              parentColumn="investissement_id"
              parentId={inv.id}
              acceptedMimes={MIME_PDF}
              uploadOpen={upload.uploadOpen}
              onUploadOpenChange={upload.onUploadOpenChange}
              uploadInitialFiles={upload.droppedFiles}
              uploadDefaultTypeNom="Devis"
            />
          </CardContent>
          <FileDropOverlay show={upload.dragging} />
        </Card>
      </div>

      {canManage && (
        <>
          <InvestissementFormDialog
            key={edit.dialogKey}
            open={edit.open}
            onOpenChange={edit.onOpenChange}
            siteId={siteId}
            investissement={inv}
          />
          <ClotureInvestissementDialog
            key={cloture.dialogKey}
            open={cloture.open}
            onOpenChange={cloture.onOpenChange}
            pending={change.isPending}
            dateDemande={inv.date_demande}
            // Déjà clôturé → le dialogue s'ouvre pré-rempli, en correction.
            initial={
              inv.statut_capex_id === ID_CLOTURE
                ? { date_cloture: inv.date_cloture, bilan: inv.bilan }
                : undefined
            }
            onConfirm={({ date_cloture, bilan }) => {
              change.mutate(
                {
                  id: inv.id,
                  statutId: ID_CLOTURE,
                  bilan,
                  dateCloture: date_cloture,
                  clotureBy: session?.user.id,
                },
                {
                  onSuccess: () => {
                    toast.success(
                      inv.statut_capex_id === ID_CLOTURE
                        ? 'Clôture modifiée'
                        : 'Investissement clôturé',
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

      <ConfirmDialog {...confirmAction.dialogProps} />
    </PageContainer>
  )
}
