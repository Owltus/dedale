import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogShell } from '@/components/common/dialog-shell'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { formatDate } from '@/lib/date'
import { listStack } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { useDashboardData } from '../use-dashboard-data'

interface AlerteJustificatifsProps {
  siteId: string
}

/**
 * Alerte « OT réglementaires clôturés sans justificatif » (en tête de la colonne
 * Documents). Bouton `destructive` VISIBLE UNIQUEMENT s'il existe ≥ 1 contrôle
 * réglementaire clôturé sans document de preuve (`justificatifsManquants`) ;
 * il affiche le compte. Le clic ouvre un dialog listant ces OT — chaque ligne
 * mène à la fiche de l'OT pour y joindre le justificatif manquant.
 */
export function AlerteJustificatifs({ siteId }: AlerteJustificatifsProps) {
  const { justificatifsQuery } = useDashboardData(siteId)
  const navigate = useNavigate()
  const [ouvert, setOuvert] = useState(false)

  const manquants = justificatifsQuery.data ?? []
  const n = manquants.length
  if (n === 0) return null

  const libelle = `${String(n)} justificatif${n > 1 ? 's' : ''} manquant${n > 1 ? 's' : ''}`

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className="w-full justify-start"
        onClick={() => setOuvert(true)}
      >
        <AlertTriangle /> {libelle}
      </Button>

      <DialogShell
        open={ouvert}
        onOpenChange={setOuvert}
        title="Contrôles réglementaires sans justificatif"
        description="Ces ordres de travail réglementaires sont clôturés mais aucun document de preuve n'y est rattaché. Ouvre chaque OT pour joindre le justificatif."
        bodyClassName={cn(listStack, 'min-h-0 flex-1 overflow-y-auto px-6 py-1')}
      >
        {manquants.map((ot) => {
          const parts: string[] = []
          if (ot.nom_equipement) parts.push(ot.nom_equipement)
          if (ot.date_cloture)
            parts.push(`Clôturé le ${formatDate(ot.date_cloture)}`)
          const sous = parts.length > 0 ? parts.join(' · ') : undefined
          return (
            <ListRow
              key={ot.id}
              size="sm"
              tone="destructive"
              media={<RowMediaIcon icon={ShieldAlert} />}
              title={ot.nom_gamme}
              subtitle={sous}
              onClick={() => {
                setOuvert(false)
                void navigate({
                  to: '/ordres-travail/$otId',
                  params: { otId: ot.id },
                })
              }}
            />
          )
        })}
      </DialogShell>
    </>
  )
}
