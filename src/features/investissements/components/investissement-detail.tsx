import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Ban, Paperclip, Pencil, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { statutsCapexQueries } from '@/features/investissements/queries'
import {
  etapesInvestissement,
  ID_REFUSE,
} from '@/features/investissements/etat'
import { useChangeStatutCapex } from '@/features/investissements/mutations'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { MIME_PDF } from '@/features/documents/upload'
import { useUploadDrop } from '@/hooks/use-upload-drop'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { useConfirmAction } from '@/hooks/use-confirm-action'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { cn } from '@/lib/utils'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { FileDropOverlay } from '@/components/common/file-drop-overlay'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Card, CardContent } from '@/components/ui/card'
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
        description={`Demandé le ${formatDate(inv.date_demande)}`}
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

      {/* BUDGET EN TÊTE : c'est le sujet d'un investissement, il était relégué en
          troisième position. Une `Card` ordinaire, et non `DetailHeaderCard` : cette
          brique est faite pour une entité ILLUSTRÉE (équipement, gamme, prestataire).
          Un investissement n'a pas de vignette, on lui posait donc une icône de repli
          dans un carré de 80 px qui ne servait qu'à décaler son contenu de 55 px vers
          la droite — d'où quatre blocs à quatre indentations différentes sur la fiche.

          Les quatre montants passent sur UNE ligne, dans l'ordre de lecture
          Demandé → Prévu → Réel → Écart. En deux colonnes, ils s'enchaînaient en
          zigzag avec 740 px de vide au milieu, et « Prévu » se retrouvait séparé de
          « Réel » — précisément la comparaison qu'on vient chercher.

          Ici les quatre emplacements sont TOUJOURS rendus, « — » compris : sur un
          écran de suivi, un montant manquant est une information (contrairement à la
          liste, qui n'affiche que les montants renseignés). */}
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
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

      {/* Description (sans titre : le contenu parle de lui-même). */}
      {inv.description?.trim() && (
        <Card className="mb-4">
          <CardContent className="text-sm whitespace-pre-wrap">
            {inv.description}
          </CardContent>
        </Card>
      )}

      {/* Suivi : frise d'avancement. Statut LIBRE → toute pastille est cliquable
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

      {/* Zone documents : prend EXACTEMENT l'espace restant (flex-1). */}
      <div className="relative flex-1">
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
        <FileDropOverlay show={upload.dragging} />
      </div>

      {canManage && (
        <InvestissementFormDialog
          key={edit.dialogKey}
          open={edit.open}
          onOpenChange={edit.onOpenChange}
          siteId={siteId}
          investissement={inv}
        />
      )}

      <ConfirmDialog {...confirmAction.dialogProps} />
    </PageContainer>
  )
}
