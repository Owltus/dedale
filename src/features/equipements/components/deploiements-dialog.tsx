import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { equipementsQueries } from '../queries'
import { nbEquipements } from '../deploiement'
import {
  AnnulationDeploiementDialog,
  useAnnulationDeploiement,
} from './annulation-deploiement-dialog'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { Button } from '@/components/ui/button'
import { DialogShell } from '@/components/common/dialog-shell'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { ListRow } from '@/components/common/list-row'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'

const HEURE = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Déploiements en masse d'une flotte (sous-catégorie de parc) : un lot par
 * déploiement, daté (semaine ISO) et compté, du plus récent. « Annuler » ouvre
 * l'aperçu de l'annulation rendu par la base puis la confirmation — l'accès
 * DURABLE au geste que le toast du déploiement ne propose que quelques
 * secondes. Lecture seulement modale ouverte. À monter sous la garde
 * `canDeployerEquipements`.
 */
export function DeploiementsDialog({
  open,
  onOpenChange,
  categorieId,
  sousCategorieNom,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  categorieId: string | null
  sousCategorieNom: string
}) {
  const lotsQuery = useQuery(equipementsQueries.lots(open ? categorieId : null))
  const annulation = useAnnulationDeploiement()

  return (
    <>
      <DialogShell
        open={open}
        onOpenChange={onOpenChange}
        title="Déploiements"
        description={`Déploiements en masse de « ${sousCategorieNom} », du plus récent au plus ancien.`}
        size="md"
      >
        {lotsQuery.isPending ? (
          <ListRowSkeletons size="sm" count={3} />
        ) : lotsQuery.isError ? (
          <ErrorState onRetry={() => void lotsQuery.refetch()} />
        ) : lotsQuery.data.length === 0 ? (
          <EmptyState
            icon={History}
            title="Aucun déploiement"
            description="Les équipements de cette famille ont été créés un par un ou importés."
          />
        ) : (
          <ul className="space-y-2" aria-label="Déploiements">
            {lotsQuery.data.map((l) => (
              <li key={l.lot}>
                <ListRow
                  size="sm"
                  title={`${formatDateAvecSemaineIso(l.debut)} à ${HEURE.format(new Date(l.debut))}`}
                  subtitle={nbEquipements(l.nombre)}
                  actions={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => annulation.demander(l.lot)}
                    >
                      Annuler
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </DialogShell>
      <AnnulationDeploiementDialog annulation={annulation} />
    </>
  )
}
