import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { evenementsQueries } from '../queries'
import { useConvertirEnEvenement } from '../mutations'
import { segOfUnique } from '@/lib/slug'
import { writeErrorMessage } from '@/lib/erreurs'
import { ConfirmDialog } from '@/components/common/confirm-dialog'

export interface ConvertirEnEvenementDialogProps {
  siteId: string
  /** Travaux à convertir (`null` = fermé). */
  aConvertir: { id: string; titre: string } | null
  onFermer: () => void
}

/**
 * Confirmation « Convertir en Événement ? » de la liste Travaux, puis redirection
 * vers la fiche de l'Événement créé. Vit côté Événements (il en lit la liste) et
 * est injecté dans `TravauxListe` par la route : la feature travaux ne dépend
 * ainsi pas d'evenements (evenements → travaux reste à sens unique).
 */
export function ConvertirEnEvenementDialog({
  siteId,
  aConvertir,
  onFermer,
}: ConvertirEnEvenementDialogProps) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const convertir = useConvertirEnEvenement()

  return (
    <ConfirmDialog
      open={aConvertir !== null}
      onOpenChange={(open) => !open && onFermer()}
      title="Convertir en Événement ?"
      description={
        aConvertir
          ? `« ${aConvertir.titre} » sera supprimé et remplacé par un nouvel Événement — toutes les zones concernées et le statut actuel sont conservés. Les documents rattachés suivent la conversion.`
          : undefined
      }
      confirmLabel="Convertir"
      loading={convertir.isPending}
      onConfirm={() => {
        if (!aConvertir) return
        const titre = aConvertir.titre
        void (async () => {
          try {
            const nouvelId = await convertir.mutateAsync(aConvertir.id)
            onFermer()
            toast.success('Converti en Événement')
            // Slug calculé sur la liste Événements FRAÎCHE (siblings à jour,
            // gère une éventuelle collision de titre) — symétrie segOfUnique.
            const evenements = await qc.fetchQuery(
              evenementsQueries.list(siteId),
            )
            const sibs = evenements.map((e) => ({ nom: e.titre, id: e.id }))
            void navigate({
              to: '/evenements/$evenement',
              params: {
                evenement: segOfUnique({ nom: titre, id: nouvelId }, sibs),
              },
            })
          } catch (e) {
            toast.error(writeErrorMessage(e))
          }
        })()
      }}
    />
  )
}
