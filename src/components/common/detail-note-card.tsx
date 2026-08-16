import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface DetailNoteCardProps {
  /**
   * En-tête de la carte : ce que le texte EST, daté.
   * Ex. « Survenu le 12/08/2026 », « Terminé le 19/08/2026 ».
   */
  label: string
  /** Le texte lui-même. Vide ou absent → `emptyText` en gris. */
  text?: string | null
  /** Ce qu'on lit à la place quand il n'y a pas de texte. */
  emptyText: string
  /**
   * Action de la carte (typiquement un `TooltipIconButton` d'édition), posée
   * dans l'en-tête et non en marge du texte.
   */
  action?: ReactNode
  className?: string
}

/**
 * Carte « note datée » d'une fiche détail : un en-tête discret qui dit QUOI et
 * QUAND, l'action à sa droite, le texte en dessous.
 *
 * Elle existe parce que les trois fiches (événement, travaux, investissement)
 * en affichent chacune DEUX — l'ouverture du dossier et sa clôture — et que les
 * six étaient recopiées à l'identique. Elles portaient aussi le même défaut : le
 * bouton d'édition flottait à droite du texte, au même niveau que lui, si bien
 * qu'il paraissait agir sur le paragraphe plutôt que sur la carte, et qu'il se
 * décalait verticalement selon la longueur du texte. Il vit maintenant dans
 * l'en-tête, à hauteur fixe.
 *
 * Le texte est TOUJOURS rendu, vide compris : sans cela, la date de la carte —
 * qui n'est écrite nulle part ailleurs — disparaîtrait avec lui.
 */
export function DetailNoteCard({
  label,
  text,
  emptyText,
  action,
  className,
}: DetailNoteCardProps) {
  return (
    // `gap-3 py-4` plutôt que le `gap-6 py-6` par défaut : l'écart standard
    // sépare des SECTIONS d'une carte riche. Ici l'en-tête et le texte sont la
    // même information — les éloigner de 24 px les faisait lire comme deux blocs
    // sans rapport. C'est le gabarit des cartes de CONTENU des fiches détail ;
    // les cartes de frise gardent le `gap-6 py-6` par défaut.
    <Card className={cn('flex flex-col gap-3 py-4', className)}>
      <CardHeader>
        {/* MÊME gabarit de titre que les autres cartes de la fiche (`text-base`,
            le standard de l'app). Il était auparavant rendu en légende grise
            minuscule : sur une fiche qui aligne aussi « Budget » et
            « Documents » en titres pleins, deux niveaux d'en-tête coexistaient
            et la page paraissait faite de deux jeux de cartes différents. La
            date EST le titre de cette carte — elle mérite ce poids. */}
        <CardTitle className="text-base">{label}</CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {/* `overflow-y-auto` en filet : il n'entre en jeu que si un hôte borne
          la hauteur de la carte. Les trois fiches actuelles ne le font pas —
          leur rangée de notes est en hauteur automatique — donc la carte grandit
          avec son texte et ce défilement ne se déclenche jamais. Deux cartes
          voisines gardent la même hauteur par `stretch`, pas par ce réglage. */}
      <CardContent className="min-h-0 flex-1 overflow-y-auto text-sm whitespace-pre-wrap">
        {text?.trim() ? (
          text
        ) : (
          <span className="text-muted-foreground">{emptyText}</span>
        )}
      </CardContent>
    </Card>
  )
}
