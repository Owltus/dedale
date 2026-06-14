import { SearchInput } from '@/components/common/search-input'

interface MiniatureFiltersProps {
  recherche: string
  onRechercheChange: (v: string) => void
}

/**
 * Barre de recherche des vignettes (par nom des entités liées), partagée par le
 * modal « Choisir une image » et l'onglet Vignettes. Délègue à `SearchInput`
 * (gabarit commun) ; ne porte que le libellé métier propre aux vignettes.
 */
export function MiniatureFilters({
  recherche,
  onRechercheChange,
}: MiniatureFiltersProps) {
  return (
    <SearchInput
      value={recherche}
      onChange={onRechercheChange}
      placeholder="Rechercher par nom de l’élément lié…"
      ariaLabel="Rechercher une vignette par nom de l’élément lié"
    />
  )
}
