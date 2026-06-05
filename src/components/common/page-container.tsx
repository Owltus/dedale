import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Conteneur racine d'une page. Padding mobile-first (16px mobile, 24px sm,
 * 32px lg). Toute page doit s'ouvrir sur ce composant plutôt qu'un `p-6` nu.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('px-4 py-6 sm:px-6 lg:px-8', className)}>{children}</div>
  )
}
