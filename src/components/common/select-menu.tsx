import type { ComponentProps } from 'react'
import { ChevronDown } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface SelectMenuProps extends ComponentProps<'select'> {
  /** Classe du CONTENEUR (largeur / disposition : `w-full`, `w-44`, fluid…). */
  containerClassName?: string
}

/**
 * `<select>` natif au CHEVRON CUSTOM : la flèche native est masquée
 * (`appearance-none`) et un `ChevronDown` lucide est dessiné à droite — pour un
 * rendu IDENTIQUE partout (menu d'onglets mobile, sélecteur de périmètre…). Le
 * chevron se grise avec l'état `disabled` (cohérent avec un dropdown désactivé).
 * Le `title` éventuel est porté par le CONTENEUR (un `<select>` désactivé ne montre
 * pas toujours son propre `title`). Source unique de ce gabarit de menu déroulant.
 */
export function SelectMenu({
  className,
  containerClassName,
  disabled,
  title,
  children,
  ...props
}: SelectMenuProps) {
  return (
    <div
      className={cn('relative inline-flex', containerClassName)}
      title={title}
    >
      <Select
        disabled={disabled}
        className={cn('appearance-none truncate pr-8', className)}
        {...props}
      >
        {children}
      </Select>
      {/* Toujours affiché (grisé si désactivé) → se lit comme un menu déroulant. */}
      <ChevronDown
        className={cn(
          'text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2',
          disabled && 'opacity-50',
        )}
      />
    </div>
  )
}
