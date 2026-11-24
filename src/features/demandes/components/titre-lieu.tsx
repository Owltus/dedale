import { Skeleton } from '@/components/ui/skeleton'
import { LIEU_NON_PRECISE } from '@/features/demandes/lieux-par-di'

/**
 * Titre d'une carte de demande : son lieu. Partagé par la page Demandes et le
 * tableau de bord.
 *
 * Pendant le chargement des lieux, une barre grisée tient la place : afficher
 * « Lieu non précisé » puis le remplacer une seconde plus tard faisait sauter
 * toute la liste.
 */
export function TitreLieu({
  lieu,
  chargement,
}: {
  lieu: string | null
  chargement: boolean
}) {
  if (lieu) return lieu
  if (chargement)
    return (
      <Skeleton className="inline-block h-3.5 w-28 align-middle">
        <span className="sr-only">Chargement du lieu</span>
      </Skeleton>
    )
  return (
    <span className="text-muted-foreground italic">{LIEU_NON_PRECISE}</span>
  )
}
