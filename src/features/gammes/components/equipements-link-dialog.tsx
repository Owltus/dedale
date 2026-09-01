import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useSyncGammeEquipements } from '../mutations'
import { equipementsQueries } from '@/features/equipements/queries'
import { nomAfficheTexte } from '@/features/equipements/format'
import { writeErrorMessage } from '@/lib/form'
import { ChecklistDialog } from '@/components/common/checklist-dialog'

interface EquipementsLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  gammeId: string
  /** Ids des équipements actuellement liés (état de référence pour le diff). */
  current: string[]
}

export function EquipementsLinkDialog({
  open,
  onOpenChange,
  siteId,
  gammeId,
  current,
}: EquipementsLinkDialogProps) {
  const sync = useSyncGammeEquipements()
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))

  return (
    <ChecklistDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Lier des équipements"
      description="Coche les équipements du site concernés par cette gamme."
      searchPlaceholder="Rechercher par nom…"
      items={equipements.map((e) => ({
        id: e.id ?? '',
        titre: nomAfficheTexte(e),
      }))}
      initialSelected={current}
      submitLabel={() => 'Enregistrer'}
      pendingLabel="Enregistrement…"
      pending={sync.isPending}
      empty="Aucun équipement."
      onSubmit={async (ids) => {
        try {
          await sync.mutateAsync({ gammeId, current, selected: ids })
          toast.success('Équipements liés mis à jour')
        } catch (e) {
          toast.error(writeErrorMessage(e))
          throw e
        }
      }}
    />
  )
}
