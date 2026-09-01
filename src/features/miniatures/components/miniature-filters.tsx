import { cn } from '@/lib/utils'
import { SearchInput } from '@/components/common/search-input'

interface MiniatureFiltersProps {
  recherche: string
  onRechercheChange: (v: string) => void
  /**
   * Épingle la barre en haut de la zone défilante (`sticky top-0`), même
   * mécanisme que `ListFilterBar` — à activer quand la liste sous-jacente est
   * longue (onglet Vignettes). Sans effet dans `MiniaturePicker` (grille
   * courte du modal, pas de scroll propre à épingler).
   */
  sticky?: boolean
}

/**
 * Barre de recherche des vignettes (par nom des entités liées), partagée par le
 * modal « Choisir une image » et l'onglet Vignettes. Délègue à `SearchInput`
 * (gabarit commun) ; ne porte que le libellé métier propre aux vignettes.
 */
export function MiniatureFilters({
  recherche,
  onRechercheChange,
  sticky = false,
}: MiniatureFiltersProps) {
  return (
    <div className={cn(sticky && 'sticky top-0 z-20 bg-background pb-2')}>
      <SearchInput
        value={recherche}
        onChange={onRechercheChange}
        placeholder="Rechercher par nom de l’élément lié…"
        ariaLabel="Rechercher une vignette par nom de l’élément lié"
      />
    </div>
  )
}
