import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * Carte d'un widget du tableau de bord : chrome standard de l'app (`ui/card` —
 * `bg-card`, bordure, `rounded-xl`, ombre) + en-tête OPTIONNEL « icône atténuée +
 * titre » calqué sur `SectionHeader`, et une action optionnelle à droite (ex. bouton
 * d'alerte). Sans `title` ni `action`, l'en-tête n'est pas rendu → le contenu (ex. un
 * graphique) occupe toute la carte. `h-full` → toutes les cartes d'une même rangée
 * s'alignent en hauteur. Source UNIQUE du cadre des widgets → homogénéité.
 */
export function DashboardCard({
  icon: Icon,
  title,
  action,
  children,
  className,
  contentClassName,
  square = false,
  dense = false,
}: {
  icon?: LucideIcon
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  /**
   * Carte au format 1:1 (hauteur = largeur). `self-start` empêche l'étirement à la
   * hauteur de la rangée (sinon la hauteur imposée l'emporterait sur l'`aspect-ratio`).
   * Défaut `false` → carte `h-full` qui s'aligne sur la plus haute de la rangée.
   */
  square?: boolean
  /**
   * Marges internes réduites (padding + gap) → le contenu (ex. un graphique) occupe
   * davantage de place. Applique la réduction à l'en-tête ET au contenu pour rester
   * aligné. Défaut `false` → padding standard des cartes de l'app.
   */
  dense?: boolean
}) {
  return (
    <Card
      className={cn(
        square ? 'aspect-square self-start' : 'h-full',
        dense ? 'gap-2 py-3' : 'gap-4',
        className,
      )}
    >
      {(title ?? action) ? (
        <CardHeader className={dense ? 'px-3' : undefined}>
          {title ? (
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
              {title}
            </CardTitle>
          ) : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn('flex-1', dense && 'px-3', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  )
}
