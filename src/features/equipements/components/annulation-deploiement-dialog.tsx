import { useAnnulerDeploiement } from '../mutations'
import { messageErreurDeploiement, nbEquipements } from '../deploiement'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'

/**
 * Annulation d'un déploiement en masse, en deux temps : `demander(lot)` lance
 * l'APERÇU calculé par la base (`annuler_deploiement`, `p_appliquer: false`) et
 * ouvre la confirmation ; « Supprimer » applique (`p_appliquer: true`). Les
 * invalidations sont celles de `useAnnulerDeploiement`.
 *
 * Usage :
 * ```tsx
 * const annulation = useAnnulationDeploiement()
 * // …
 * <Button onClick={() => annulation.demander(lot)}>Annuler</Button>
 * <AnnulationDeploiementDialog annulation={annulation} />
 * ```
 */
export function useAnnulationDeploiement() {
  const apercu = useAnnulerDeploiement()
  const annulation = useAnnulerDeploiement()
  const suppression = useConfirmDelete<string>({
    onDelete: (lot) => annulation.mutateAsync({ lot, appliquer: true }),
    successMessage: () => {
      const n = apercu.data?.aSupprimer ?? 0
      return `Déploiement annulé : ${nbEquipements(n)} supprimé${n > 1 ? 's' : ''}`
    },
    errorMessage: messageErreurDeploiement,
  })
  return {
    apercu,
    suppression,
    demander: (lot: string) => {
      apercu.mutate({ lot, appliquer: false })
      suppression.demander(lot)
    },
  }
}

/** Confirmation de l'annulation : ce qui part, ce qui reste (et pourquoi). */
export function AnnulationDeploiementDialog({
  annulation,
}: {
  annulation: ReturnType<typeof useAnnulationDeploiement>
}) {
  const { apercu: apercuMut, suppression } = annulation
  const apercu = apercuMut.data
  const conserves = apercu?.conserves ?? []
  const retirees = (apercu?.gammes ?? []).filter(
    (g) => g.operationsRetirees > 0,
  )
  return (
    <ConfirmDeleteDialog
      {...suppression.dialogProps}
      entityLabel={
        apercu?.aSupprimer === 1
          ? 'l’équipement de ce déploiement'
          : apercu
            ? `les ${nbEquipements(apercu.aSupprimer)} de ce déploiement`
            : 'les équipements de ce déploiement'
      }
      loadingImpacts={apercuMut.isPending}
      blocked={apercuMut.isError || apercu?.aSupprimer === 0}
      blockedReason={
        apercuMut.isError
          ? messageErreurDeploiement(apercuMut.error)
          : 'Tous les équipements de ce déploiement ont déjà un historique : il n’y a rien à supprimer.'
      }
      impactsTitle={
        conserves.length > 0
          ? `${nbEquipements(conserves.length)} conservé${conserves.length > 1 ? 's' : ''}, car déjà utilisé${conserves.length > 1 ? 's' : ''} :`
          : undefined
      }
      impacts={conserves.map((c) => `${c.lieu} (${c.raisons.join(', ')})`)}
      warning={
        apercu
          ? `Suppression définitive des équipements créés par ce déploiement, détachés de leurs plans de maintenance.${retirees.length > 0 ? ` Opérations retirées des ordres de travail ouverts : ${retirees.map((g) => `${g.nom} (${String(g.operationsRetirees)})`).join(', ')}.` : ''}`
          : undefined
      }
    />
  )
}
