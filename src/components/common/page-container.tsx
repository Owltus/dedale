import { Children, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Géométrie interne d'une page — SOURCE UNIQUE des classes de l'en-tête fixe et
 * du corps défilant. `PageContainer` les utilise en interne ; les pages en mode
 * `fill` (explorateurs, onglets…) les réutilisent pour reconstruire la même
 * mise en page au lieu de recopier les classes.
 */

/** En-tête FIXE d'une page (padding mobile-first, sans padding bas). */
export function FillHeader({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('shrink-0 px-4 pt-6 sm:px-6 lg:px-8', className)}>
      {children}
    </div>
  )
}

/** Corps DÉFILANT d'une page (la scrollbar commence sous l'en-tête). */
export function ScrollBody({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8',
        className,
      )}
    >
      {children}
    </div>
  )
}

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
    // L'enfant gère lui-même son en-tête fixe + son défilement : il DOIT poser
    // sa propre zone scrollable (via `FillHeader` + `ScrollBody` ci-dessus),
    // sinon son contenu déborde et est clippé par le `main` (overflow-hidden).
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    )
  }

  const kids = Children.toArray(children)

  // Un seul enfant (ex. formulaire centré) : pas d'en-tête distinct, tout défile
  // (le `pt-6` complète le `pb-6` du corps → padding vertical symétrique).
  if (kids.length <= 1) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ScrollBody className={cn('pt-6', className)}>{children}</ScrollBody>
      </div>
    )
  }

  // Cas général : 1er enfant = en-tête FIXE ; le reste défile.
  const [header, ...body] = kids
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <FillHeader>{header}</FillHeader>
      <ScrollBody className={className}>{body}</ScrollBody>
    </div>
  )
}
