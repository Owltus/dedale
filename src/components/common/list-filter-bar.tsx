import { SearchInput } from '@/components/common/search-input'
import { Select } from '@/components/ui/select'

export interface FilterOption {
  value: string
  label: string
}

/** Valeur de filtre : tous les statuts. */
export const FILTRE_TOUS = 'all'
/** Valeur de filtre par défaut « actif » : uniquement les éléments NON terminés. */
export const FILTRE_NON_TERMINES = 'actifs'

interface ListFilterBarProps {
  search: string
  onSearchChange: (value: string) => void
  /** Placeholder du champ de recherche. */
  searchPlaceholder?: string
  filterValue: string
  onFilterChange: (value: string) => void
  /** Options du Select de filtre (cf. `statutFilterOptions`). */
  options: FilterOption[]
  /** Nom accessible du filtre (défaut « Filtrer »). */
  filterLabel?: string
}

/**
 * Barre pleine largeur « recherche + filtre » des pages liste : un `SearchInput`
 * extensible suivi d'un `Select` de filtre (statut/type). Source UNIQUE (ex-barre
 * de la page Demandes) — réutilisée par Demandes, Travaux, Investissements… La
 * page fournit les `options` et applique le filtrage (cf. `matchStatutFilter`).
 * Voir `NoSearchResults` pour l'état « aucun résultat ».
 */
export function ListFilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  filterValue,
  onFilterChange,
  options,
  filterLabel = 'Filtrer',
}: ListFilterBarProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="flex-1"
      />
      <Select
        value={filterValue}
        onChange={(e) => onFilterChange(e.target.value)}
        aria-label={filterLabel}
        className="sm:w-52"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

/**
 * Prédicat de filtrage par statut, partagé : `FILTRE_TOUS` = tout,
 * `FILTRE_NON_TERMINES` = exclut les statuts `terminaux` fournis (défaut « actif »),
 * sinon égalité d'id exact (la valeur est l'id stringifié).
 */
export function matchStatutFilter(
  statutId: number,
  filterValue: string,
  terminaux: readonly number[],
): boolean {
  if (filterValue === FILTRE_TOUS) return true
  if (filterValue === FILTRE_NON_TERMINES) return !terminaux.includes(statutId)
  return statutId === Number(filterValue)
}

/**
 * Options du filtre de statut : « Non terminés » (défaut, si `withNonTermines`)
 * + « Tous les statuts » + chaque statut dans l'ordre fourni (la page trie selon
 * son cycle). Passer `withNonTermines: false` pour ne pas proposer le défaut
 * « actif » (ex. une liste sans notion de terminaison).
 */
export function statutFilterOptions(
  statuts: { id: number; nom: string }[],
  withNonTermines = true,
): FilterOption[] {
  return [
    ...(withNonTermines
      ? [{ value: FILTRE_NON_TERMINES, label: 'Non terminés' }]
      : []),
    { value: FILTRE_TOUS, label: 'Tous les statuts' },
    ...statuts.map((s) => ({ value: String(s.id), label: s.nom })),
  ]
}
