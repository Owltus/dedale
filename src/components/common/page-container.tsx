import { Children, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageContainerProps {
  children: ReactNode
  className?: string
  /**
   * Mode « fill » : l'enfant gère lui-même son en-tête fixe et son défilement
   * (ex. page à onglets). Sinon, le 1er enfant est traité comme en-tête FIXE et
   * le reste défile — la scrollbar commence donc SOUS l'en-tête.
   */
  fill?: boolean
}

/**
 * Conteneur racine d'une page. <main> ne défile plus : l'en-tête reste fixe en
 * haut et seul le corps défile (scrollbar sous l'en-tête). Padding mobile-first.
 */
export function PageContainer({
  children,
  className,
  fill = false,
}: PageContainerProps) {
  if (fill) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>
  }

  const kids = Children.toArray(children)

  // Un seul enfant (ex. formulaire centré) : pas d'en-tête distinct, tout défile.
  if (kids.length <= 1) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8',
            className,
          )}
        >
          {children}
        </div>
      </div>
    )
  }

  // Cas général : 1er enfant = en-tête FIXE ; le reste défile.
  const [header, ...body] = kids
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-6 sm:px-6 lg:px-8">{header}</div>
      <div
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8',
          className,
        )}
      >
        {body}
      </div>
    </div>
  )
}
