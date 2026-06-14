import { Search } from 'lucide-react'
import { ORIGINE_FILTRES, type OrigineFiltre } from '../filters'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface MiniatureFiltersProps {
  recherche: string
  onRechercheChange: (v: string) => void
  origine: OrigineFiltre
  onOrigineChange: (o: OrigineFiltre) => void
}

/**
 * Barre de recherche (par nom des entités liées) + puces de filtre par ORIGINE,
 * partagée par le modal « Choisir une image » et l'onglet Vignettes. Source unique
 * de cette UX (esprit composant réutilisable).
 */
export function MiniatureFilters({
  recherche,
  onRechercheChange,
  origine,
  onOrigineChange,
}: MiniatureFiltersProps) {
  return (
    <div className="flex flex-col gap-2">
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
      <div className="flex flex-wrap gap-1.5">
        {ORIGINE_FILTRES.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={origine === f.value ? 'default' : 'outline'}
            className="h-7 rounded-full px-3 text-xs"
            onClick={() => onOrigineChange(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
