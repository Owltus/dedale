import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PageHeaderProps {
  title: string
  description?: string
  /** Actions alignées à droite (ex. bouton « + Nouveau », « Modifier »). */
  action?: ReactNode
  /**
   * Vue DÉTAIL : affiche un bouton « Retour » au-dessus du titre. Le parent gère
   * la navigation (route ou état local) — le composant reste agnostique du routeur.
   */
  onBack?: () => void
  /** Libellé du bouton de retour (défaut « Retour »). */
  backLabel?: string
  /** Badges affichés à côté du titre (ex. statut actif / anonymisé). */
  titleBadges?: ReactNode
}

/**
 * En-tête standard d'une page : titre + description + actions. Sert AUSSI aux vues
 * détail via `onBack` (bouton retour) et `titleBadges` (statuts près du titre).
 * Composant unique réutilisé par toutes les pages → un changement impacte partout.
 */
export function PageHeader({
  title,
  description,
  action,
  onBack,
  backLabel = 'Retour',
  titleBadges,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="text-muted-foreground -ml-2 mb-1 h-auto gap-1 px-2 py-1"
          >
            <ChevronLeft className="size-4" />
            {backLabel}
          </Button>
        )}
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {titleBadges}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
