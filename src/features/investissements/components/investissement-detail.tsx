import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { statutsCapexQueries } from '@/features/investissements/queries'
import {
  etapesInvestissement,
  variantStatutCapex,
} from '@/features/investissements/etat'
import { ecartCapex, formatEuros } from '@/features/investissements/format'
import { InvestissementFormDialog } from './investissement-form-dialog'
import { MIME_PDF } from '@/features/documents/upload'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { StatusStepper } from '@/components/common/status-stepper'
import { DocumentsTab } from '@/components/common/documents-tab'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

export function InvestissementDetail({
  investissement: inv,
  siteId,
  canManage,
  onBack,
}: {
  investissement: Investissement
  siteId: string
  canManage: boolean
  onBack: () => void
}) {
  const [edit, setEdit] = useState(false)
  const { data: statuts = [] } = useQuery(statutsCapexQueries.list())
  const noms = new Map(statuts.map((s) => [s.id, s.nom]))
  const statutLabel = noms.get(inv.statut_capex_id)
  const etapes = etapesInvestissement(inv.statut_capex_id, noms)

  const { label, depassement } = ecartCapex(inv)
  const ecartLabel = label ?? '—'

  return (
    <PageContainer>
      <PageHeader
        title={inv.libelle}
        description={`Demandé le ${formatDate(inv.date_demande)}`}
        breadcrumb={[{ label: 'Investissements', onClick: onBack }]}
        titleBadges={
          statutLabel ? (
            <Badge variant={variantStatutCapex(inv.statut_capex_id)}>
              {statutLabel}
            </Badge>
          ) : undefined
        }
        action={
          canManage ? (
            <TooltipIconButton
              icon={<Pencil />}
              label="Modifier l'investissement"
              variant="outline"
              onClick={() => setEdit(true)}
            />
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

      <DocumentsTab
        title="Documents"
        liaison="documents_investissements"
        parentColumn="investissement_id"
        parentId={inv.id}
        acceptedMimes={MIME_PDF}
      />

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
