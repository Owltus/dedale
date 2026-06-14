import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface MiniatureFiltersProps {
  recherche: string
  onRechercheChange: (v: string) => void
}

/**
 * Barre de recherche des vignettes (par nom des entités liées), partagée par le
 * modal « Choisir une image » et l'onglet Vignettes. Source unique de cette UX.
 */
export function MiniatureFilters({
  recherche,
  onRechercheChange,
}: MiniatureFiltersProps) {
  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        value={recherche}
        onChange={(e) => onRechercheChange(e.target.value)}
        placeholder="Rechercher par nom de l’élément lié…"
        className="pl-8"
        aria-label="Rechercher une vignette par nom de l’élément lié"
      />
    </div>
  )
}
