import { useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SubTabItem<T extends string = string> {
  id: T
  /** Libellé visible (texte ou nœud). */
  label: ReactNode
  /** Icône optionnelle rendue avant le libellé (ex. `<Package className="size-4" />`). */
  icon?: ReactNode
}

interface SubTabsProps<T extends string> {
  items: SubTabItem<T>[]
  /** Onglet actif (composant CONTRÔLÉ). */
  value: T
  onValueChange: (id: T) => void
  /** Nom ARIA de la barre (ex. « Sections de la gamme »). */
  ariaLabel: string
  className?: string
}

/**
 * Sous-onglets INLINE (style souligné) pour naviguer entre les SECTIONS d'une
 * page — distincts de la barre d'onglets plein écran de la Bibliothèque (voir
 * `<Tabs>`, qui embarque en plus titre + bouton « + » + contextes). VOLONTAIREMENT
 * léger : il ne porte QUE la barre.
 *
 * Contrôlé (`value`/`onValueChange`), accessible (pattern WAI-ARIA Tabs :
 * `role=tablist`/`tab`, navigation clavier flèches + Début/Fin, roving `tabIndex`)
 * et mobile-first (défile horizontalement s'il déborde). Source UNIQUE qui
 * remplace les `TabButton` dupliqués d'`equipements` / `registre` / `gammes`.
 */
export function SubTabs<T extends string>({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: SubTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)

  function focusAt(index: number) {
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[index]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((t) => t.id === value)
    if (current < 0) return
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (current + 1) % items.length
    else if (e.key === 'ArrowLeft')
      next = (current - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next === null) return
    e.preventDefault()
    const target = items[next]
    if (!target) return
    onValueChange(target.id)
    focusAt(next)
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('mb-4 flex gap-1 overflow-x-auto border-b', className)}
    >
      {items.map((tab) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(tab.id)}
            className={cn(
              'focus-visible:ring-ring flex shrink-0 items-center gap-2 rounded-t-sm border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
              selected
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
