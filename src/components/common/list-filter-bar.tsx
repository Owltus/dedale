import { cn } from '@/lib/utils'
import { SearchInput } from '@/components/common/search-input'
import { SelectDropdown } from '@/components/ui/select-dropdown'

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
  /**
   * Filtre OPTIONNEL : fournir `options` (+ `filterValue`/`onFilterChange`)
   * affiche le Select à droite. Omis → barre de recherche SEULE, pleine largeur
   * (même gabarit que les listes à filtre, ex. Prestataires).
   */
  filterValue?: string
  onFilterChange?: (value: string) => void
  options?: FilterOption[]
  /** Nom accessible du filtre (défaut « Filtrer »). */
  filterLabel?: string
  /**
   * Épingle la barre en HAUT de la zone défilante (`sticky top-0`) : elle reste
   * visible pendant le défilement de la liste. Fond opaque + `z` au-dessus des cartes
   * (qui glissent dessous). À utiliser quand la liste est longue (ex. Ordres de travail).
   */
  sticky?: boolean
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
  sticky = false,
}: ListFilterBarProps) {
  // Filtre présent uniquement si la page fournit options + état contrôlé. Regroupé
  // en objet `const` → narrowing stable jusque dans le closure `onChange`.
  const filtre =
    options && options.length > 0 && filterValue !== undefined && onFilterChange
      ? { value: filterValue, onChange: onFilterChange, options }
      : null

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center',
        // Épinglée : fond opaque (les cartes glissent dessous) et `z` au-dessus des
        // cartes. `top-0` colle au sommet de la zone défilante (PageContainer body) ;
        // `pb-2` ménage un fond sous les contrôles → transition nette des cartes.
        sticky && 'sticky top-0 z-20 bg-background pb-2',
      )}
    >
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder={searchPlaceholder}
        className="flex-1"
      />
      {filtre && (
        // Select RADIX (pas le `<select>` natif) : le panneau ouvert suit le
        // thème clair/sombre et le chevron est celui de l'app. En natif, ce
        // filtre — le sélecteur le plus vu de l'application, présent sur
        // 5 pages liste — affichait la flèche du système d'exploitation juste
        // à côté d'une loupe lucide.
        <SelectDropdown
          value={filtre.value}
          onValueChange={filtre.onChange}
          options={filtre.options}
          ariaLabel={filterLabel}
          className="sm:w-52"
          checkIndicator={false}
        />
      )}
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

/**
 * Options d'un filtre par TYPE (référentiel sans notion de terminaison) :
 * « Tous les … » puis chaque type. Calqué sur `statutFilterOptions` pour que
 * la sentinelle `FILTRE_TOUS` soit la même partout — une page qui passerait
 * une chaîne vide contournerait la constante et casserait tout prédicat
 * partagé qui la teste.
 */
export function typeFilterOptions(
  types: { id: number; nom: string }[],
  labelTous = 'Tous les types',
): FilterOption[] {
  return [
    { value: FILTRE_TOUS, label: labelTous },
    ...types.map((t) => ({ value: String(t.id), label: t.nom })),
  ]
}

/** Prédicat du filtre par type : `FILTRE_TOUS` = tout, sinon égalité d'id. */
export function matchTypeFilter(typeId: number, filterValue: string): boolean {
  return filterValue === FILTRE_TOUS || typeId === Number(filterValue)
}
