import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Paperclip, Pencil } from 'lucide-react'
import { statutsCapexQueries } from '@/features/investissements/queries'
import { etapesInvestissement } from '@/features/investissements/etat'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { MIME_PDF } from '@/features/documents/upload'
import { useFileDrop } from '@/hooks/use-file-drop'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
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
  const [uploadOpen, setUploadOpen] = useState(false)
  // Fichiers issus d'un glisser-déposer sur la page → pré-remplis dans le dialogue.
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const etapes = etapesInvestissement(inv.statut_capex_id, noms)

  const { label, depassement } = ecartCapex(inv)
  const ecartLabel = label ?? '—'

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

      {/* Suivi : frise d'avancement (sans titre). */}
      {etapes && (
        <Card className="mb-6">
          <CardContent>
            <StatusStepper steps={etapes} />
          </CardContent>
        </Card>
      )}

      {/* Budget (sans titre : les libellés des montants suffisent). */}
      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Montant label="Demandé" value={formatEuros(inv.montant_demande)} />
          <Montant label="Prévu" value={formatEuros(inv.montant_prevu)} />
          <Montant label="Réel" value={formatEuros(inv.depense_reelle)} />
          <Montant
            label="Écart prévu / réel"
            value={ecartLabel}
            className={depassement ? 'text-warning' : undefined}
          />
        </CardContent>
      </Card>

      {/* Zone documents : prend EXACTEMENT l'espace restant (flex-1, sans min-h
          qui forcerait un débordement) → surface de dépôt pleine hauteur, mise en
          valeur en entier pendant le glisser-déposer, sans scrollbar parasite. La
          page ne défile que s'il y a vraiment trop de documents. */}
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
        {dragging && (
          <div className="border-primary bg-primary/5 pointer-events-none absolute inset-0 z-10 rounded-lg border-2 border-dashed" />
        )}
      </div>

      {canManage && (
        <InvestissementFormDialog
          key={inv.id}
          open={edit}
          onOpenChange={setEdit}
          siteId={siteId}
          investissement={inv}
        />
      )}

    </PageContainer>
  )
}

function Montant({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-medium tabular-nums', className)}>{value}</span>
    </div>
  )
}
