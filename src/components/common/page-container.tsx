import { Children, type ComponentProps, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Géométrie interne d'une page — SOURCE UNIQUE des classes de l'en-tête fixe et
 * du corps défilant. `PageContainer` les utilise en interne ; les pages en mode
 * `fill` (explorateurs, onglets…) les réutilisent pour reconstruire la même
 * mise en page au lieu de recopier les classes.
 */

/**
 * En-tête FIXE d'une page (padding mobile-first, sans padding bas).
 *
 * Accepte les props d'un `div` (rôle ARIA, id…) : sans cela, un appelant ayant
 * besoin d'un attribut recopiait les classes à côté de la brique — c'est ainsi
 * que des valeurs divergentes sont apparues.
 */
export function FillHeader({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn('shrink-0 px-4 pt-6 sm:px-6 lg:px-8', className)}
      {...props}
    >
      {children}
    </div>
  )
}

/** Corps DÉFILANT d'une page (la scrollbar commence sous l'en-tête). */
export function ScrollBody({
  className,
  children,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 lg:px-8',
        className,
      )}
      {...props}
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
  /**
   * Borne la largeur du CORPS défilant (ex. `max-w-2xl`) en le centrant, sans
   * toucher à l'en-tête, qui reste pleine largeur ET fixe.
   *
   * À utiliser pour les pages en colonne étroite (réglages, fiche d'une
   * personne). Sans cette prop, l'appelant est tenté d'envelopper en-tête ET
   * cartes dans un seul `div` centré — il n'a alors plus qu'UN enfant, tombe
   * dans le cas ci-dessous, et son en-tête part au défilement.
   */
  bodyMaxWidth?: string
}

/**
 * Conteneur racine d'une page. <main> ne défile plus : l'en-tête reste fixe en
 * haut et seul le corps défile (scrollbar sous l'en-tête). Padding mobile-first.
 */
export function PageContainer({
  children,
  className,
  fill = false,
  bodyMaxWidth,
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
      <ScrollBody className={className}>
        {bodyMaxWidth ? (
          <div className={cn('mx-auto flex flex-col gap-4', bodyMaxWidth)}>
            {body}
          </div>
        ) : (
          body
        )}
      </ScrollBody>
    </div>
  )
}
