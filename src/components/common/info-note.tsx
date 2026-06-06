import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Encart d'information discret (fond accent léger, bordure douce). Icône
 * optionnelle à gauche. Sert aux confirmations (« e-mail envoyé »…) et notes.
 */
export function InfoNote({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <div className="border-primary/20 bg-primary/5 flex items-start gap-2 rounded-md border p-3 text-sm">
      {Icon && <Icon className="text-primary mt-0.5 size-4 shrink-0" />}
      <span>{children}</span>
    </div>
  )
}
