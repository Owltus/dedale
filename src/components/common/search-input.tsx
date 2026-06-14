import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  /** Placeholder ; par convention « Rechercher … ». */
  placeholder?: string
  /** Nom accessible (défaut : le placeholder). */
  ariaLabel?: string
  /** Classe du CONTENEUR — largeur / marge (ex. `max-w-xs flex-1`, `mb-4 max-w-sm`). */
  className?: string
}

/**
 * Champ de recherche standard : `<Input>` précédé d'une icône loupe (non
 * cliquable), gabarit identique partout (icône à gauche, `pl-8`). Source UNIQUE
 * remplaçant les barres de recherche réimplémentées dans `equipements`,
 * `demandes` et la recherche de vignettes. La LARGEUR/marge reste à l'appelant
 * (via `className` sur le conteneur) car elle dépend de la page. Voir aussi
 * `NoSearchResults` pour l'état « aucun résultat » du filtrage.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Rechercher…',
  ariaLabel,
  className,
}: SearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="pl-8"
      />
    </div>
  )
}
