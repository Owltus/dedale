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

/**
 * Apparence de la barre :
 * - `underline` (défaut) : onglets soulignés, légers, pour les SECTIONS d'une page.
 * - `segmented` : pilules sur un petit fond arrondi `bg-muted` (« segmented
 *   control »), façon Bibliothèque mais compact et propre.
 */
export type SubTabsVariant = 'underline' | 'segmented'

interface SubTabsProps<T extends string> {
  items: SubTabItem<T>[]
  /** Onglet actif (composant CONTRÔLÉ). */
  value: T
  onValueChange: (id: T) => void
  /** Nom ARIA de la barre (ex. « Sections de la gamme »). */
  ariaLabel: string
  variant?: SubTabsVariant
  className?: string
}

// Classes par variante : la barre (`list`), chaque onglet (`tab`), et l'état
// sélectionné / non sélectionné. Source UNIQUE du style → on ajoute une variante
// ici sans toucher au reste.
const VARIANT_STYLES: Record<
  SubTabsVariant,
  { list: string; tab: string; active: string; inactive: string }
> = {
  underline: {
    list: 'flex gap-1 overflow-x-auto border-b',
    tab: 'shrink-0 rounded-t-sm border-b-2 px-3 py-2',
    active: 'border-primary text-foreground',
    inactive: 'border-transparent text-muted-foreground hover:text-foreground',
  },
  segmented: {
    // Mobile : largeur-contenu + défilement (4 onglets ne tiennent pas en plein) ;
    // >= sm : pleine largeur, onglets répartis également (`flex-1`).
    list: 'inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 sm:flex sm:w-full',
    tab: 'shrink-0 justify-center rounded-md px-3 py-1.5 sm:flex-1',
    active: 'bg-background text-foreground shadow-sm',
    inactive: 'text-muted-foreground hover:text-foreground',
  },
}

/**
 * Sous-onglets INLINE pour naviguer entre les SECTIONS d'une page — distincts de
 * la barre d'onglets plein écran de la Bibliothèque (voir `<Tabs>`, qui embarque
 * en plus titre + bouton « + » + contextes). VOLONTAIREMENT léger : il ne porte
 * QUE la barre. Style réglable via `variant` (souligné par défaut).
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
  variant = 'underline',
  className,
}: SubTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null)
  const styles = VARIANT_STYLES[variant]

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
      className={cn('mb-4', styles.list, className)}
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
              'focus-visible:ring-ring flex items-center gap-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none',
              styles.tab,
              selected ? styles.active : styles.inactive,
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
