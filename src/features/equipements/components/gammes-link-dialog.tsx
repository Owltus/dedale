import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSyncEquipementGammes } from '../mutations'
import { gammesQueries } from '@/features/gammes/queries'
import { writeErrorMessage } from '@/lib/form'
import { ChecklistDialog } from '@/components/common/checklist-dialog'

interface GammesLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  equipementId: string
  /** Ids des gammes actuellement liées (état de référence pour le diff). */
  current: string[]
}

/**
 * Modale « Lier des gammes » côté fiche équipement — miroir exact
 * d'`EquipementsLinkDialog` (features/gammes/components/), sens inverse.
 */
export function GammesLinkDialog({
  open,
  onOpenChange,
  siteId,
  equipementId,
  current,
}: GammesLinkDialogProps) {
  const sync = useSyncEquipementGammes()
  const { data: gammes = [] } = useQuery(gammesQueries.list(siteId))

  return (
    <ChecklistDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Lier des gammes"
      description="Coche les gammes du site concernées par cet équipement."
      searchPlaceholder="Rechercher par nom…"
      items={gammes.map((g) => ({
        id: g.id,
        titre: g.nom,
      }))}
      initialSelected={current}
      submitLabel={() => 'Enregistrer'}
      pendingLabel="Enregistrement…"
      pending={sync.isPending}
      empty="Aucune gamme."
      onSubmit={async (ids) => {
        try {
          await sync.mutateAsync({ equipementId, current, selected: ids })
          toast.success('Gammes liées mises à jour')
        } catch (e) {
          toast.error(writeErrorMessage(e))
          throw e
        }
      }}
    />
  )
}
