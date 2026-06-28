import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Ban, Coins, Paperclip, Pencil, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { statutsCapexQueries } from '@/features/investissements/queries'
import { etapesInvestissement, ID_REFUSE } from '@/features/investissements/etat'
import { useChangeStatutCapex } from '@/features/investissements/mutations'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { MIME_PDF } from '@/features/documents/upload'
import { useFileDrop } from '@/hooks/use-file-drop'
import { formatDate } from '@/lib/date'
import { writeErrorMessage } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
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
  const [edit, setEdit] = useState(false)
  const [refuserOpen, setRefuserOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer sur la page → pré-remplis dans le dialogue.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
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

  // Ouverture manuelle (bouton top bar) : aucun fichier pré-rempli.
  const openUploadEmpty = () => {
    setDroppedFiles([])
    setUploadOpen(true)
  }
  // Fermeture : on oublie les fichiers déposés pour repartir propre au coup suivant.
  const handleUploadOpenChange = (open: boolean) => {
    setUploadOpen(open)
    if (!open) setDroppedFiles([])
  }
  // Glisser-déposer sur TOUTE la page (réservé aux rôles pouvant rattacher).
  const { dragging } = useFileDrop({
    enabled: canManage,
    onFiles: (files) => {
      setDroppedFiles(files)
      setUploadOpen(true)
    },
  })

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
        action={
          canManage ? (
            <>
              <TooltipIconButton
                icon={<Paperclip />}
                label="Rattacher un document"
                variant="outline"
                onClick={openUploadEmpty}
              />
              <TooltipIconButton
                icon={<Pencil />}
                label="Modifier l'investissement"
                variant="outline"
                onClick={() => setEdit(true)}
              />
              {canRefuser && (
                <TooltipIconButton
                  icon={<Ban className="text-destructive" />}
                  label="Refuser l'investissement"
                  variant="outline"
                  onClick={() => setRefuserOpen(true)}
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

      {/* Description en tête (sans titre : le contenu parle de lui-même). */}
      {inv.description?.trim() && (
        <Card className="mb-6">
          <CardContent className="text-sm whitespace-pre-wrap">
            {inv.description}
          </CardContent>
        </Card>
      )}

      {/* Suivi : frise d'avancement. Statut LIBRE → toute pastille est cliquable
          (positionne ce statut) ; « Refuser » est en barre de titre. */}
      {etapes && (
        <Card className="mb-6">
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

      {/* Budget : carte d'en-tête partagée (montants + écart coloré si dépassement). */}
      <DetailHeaderCard
        className="mb-6"
        columns={2}
        fallbackIcon={Coins}
        fields={[
          { label: 'Demandé', value: formatEuros(inv.montant_demande) },
          { label: 'Prévu', value: formatEuros(inv.montant_prevu) },
          { label: 'Réel', value: formatEuros(inv.depense_reelle) },
          {
            label: 'Écart prévu / réel',
            value: ecartLabel,
            tone: depassement ? 'warning' : undefined,
          },
        ]}
      />

      {/* Zone documents : prend EXACTEMENT l'espace restant (flex-1). */}
      <div className="relative flex-1">
        <DocumentsTab
          liaison="documents_investissements"
          parentColumn="investissement_id"
          parentId={inv.id}
          acceptedMimes={MIME_PDF}
          uploadOpen={uploadOpen}
          onUploadOpenChange={handleUploadOpenChange}
          uploadInitialFiles={droppedFiles}
          uploadDefaultTypeNom="Devis"
        />
        <FileDropOverlay show={dragging} />
      </div>

      {canManage && (
        <InvestissementFormDialog
          key={`${inv.id}-${String(edit)}`}
          open={edit}
          onOpenChange={setEdit}
          siteId={siteId}
          investissement={inv}
        />
      )}

      <ConfirmDialog
        open={refuserOpen}
        onOpenChange={setRefuserOpen}
        title="Refuser l'investissement ?"
        description="L'investissement passera au statut « Refusé »."
        confirmLabel="Refuser"
        destructive
        loading={change.isPending}
        onConfirm={() =>
          change.mutate(
            { id: inv.id, statutId: ID_REFUSE },
            {
              onSuccess: () => {
                toast.success('Investissement refusé')
                setRefuserOpen(false)
              },
              onError: (e) => toast.error(writeErrorMessage(e)),
            },
          )
        }
      />
    </PageContainer>
  )
}

