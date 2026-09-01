import { Badge } from '@/components/ui/badge'

interface EquipementBadgesProps {
  /** Valeur secondaire affichée (badge du haut). */
  secondaire: string | null
  /** Valeur tertiaire affichée (badge du bas). */
  tertiaire: string | null
}

/**
 * Badges d'un équipement (109) : la valeur secondaire au-dessus, la valeur
 * tertiaire en dessous — au plus 2 badges empilés, chacun optionnel. MÊME
 * gabarit que `StatutColonne` (carte OT) : colonne à largeur FIXE et
 * CENTRÉE — pas juste alignée à gauche/droite — pour que la colonne entière
 * reste alignée d'une carte à l'autre malgré des valeurs de longueurs très
 * différentes (ex. « Poudre » vs « Eau pulvérisée »).
 * `null` = pas de rendu de la brique (appelant : passer `undefined` en
 * `badges`/`titreBadges` quand les deux sont `null`, pour ne pas réserver la
 * place dans `ListRow`/`PageHeader`).
 */
export function EquipementBadges({
  secondaire,
  tertiaire,
}: EquipementBadgesProps) {
  return (
    <div className="flex w-32 flex-col items-center gap-1 text-center">
      {secondaire && <Badge variant="outline">{secondaire}</Badge>}
      {tertiaire && <Badge variant="outline">{tertiaire}</Badge>}
    </div>
  )
}
