import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { listStack } from '@/lib/responsive'
import {
  ListFilterBar,
  FILTRE_TOUS,
  type FilterOption,
} from '@/components/common/list-filter-bar'
import { NoSearchResults } from '@/components/common/no-search-results'

interface ListPageBodyProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  /** Filtre optionnel : omis → barre de recherche seule, pleine largeur. */
  filterValue?: string
  onFilterChange?: (value: string) => void
  options?: FilterOption[]
  filterLabel?: string
  /** Épingle la barre en haut de la zone défilante (listes longues). */
  sticky?: boolean
  /**
   * Vrai quand le filtrage client ne laisse aucune ligne — le 5ᵉ état, celui
   * que `QueryState` ne couvre pas (il ne connaît que la donnée brute).
   */
  isEmpty: boolean
  /** Message du 5ᵉ état. Nomme l'entité : « Aucun travaux ne correspond… ». */
  emptySearchDescription: string
  /** Les lignes déjà filtrées, à empiler dans `listStack`. */
  children: ReactNode
  className?: string
}

/**
 * Corps d'une page liste : barre de recherche/filtre, puis les lignes — ou le
 * message « aucun résultat » quand le filtre ne laisse rien.
 *
 * Sept routes rendaient cette séquence à l'identique, en écrivant sept fois la
 * même classe `flex flex-col gap-4` alors que l'empilement des lignes, lui,
 * passait déjà par le helper `listStack`. La brique referme cet écart.
 *
 * Volontairement RESTREINTE : elle ne porte ni `PageContainer`, ni `PageHeader`,
 * ni `QueryState`. Ceux-ci restent visibles dans la page, où ils portent des
 * variations légitimes (action d'en-tête conditionnée au rôle, état vide
 * spécifique, squelette de la bonne densité). Une brique qui les avalerait
 * rendrait les pages plus courtes mais leurs divergences légitimes plus
 * difficiles à exprimer.
 */
export function ListPageBody({
  search,
  onSearchChange,
  searchPlaceholder,
  filterValue,
  onFilterChange,
  options,
  filterLabel,
  sticky,
  isEmpty,
  emptySearchDescription,
  children,
  className,
}: ListPageBodyProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <ListFilterBar
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        filterValue={filterValue}
        onFilterChange={onFilterChange}
        options={options}
        filterLabel={filterLabel}
        sticky={sticky}
      />
      {isEmpty ? (
        <NoSearchResults
          description={emptySearchDescription}
          // « Afficher tout » n'apparaît que si quelque chose est effectivement
          // masqué : un filtre non neutre, ou une recherche en cours. Sur les
          // listes dont le défaut est « non terminés », l'utilisateur n'a rien
          // filtré lui-même — sans ce bouton, la page se lit comme vide.
          onReset={
            (filterValue !== undefined && filterValue !== FILTRE_TOUS) ||
            search !== ''
              ? () => {
                  onSearchChange('')
                  if (onFilterChange) onFilterChange(FILTRE_TOUS)
                }
              : undefined
          }
        />
      ) : (
        <div className={listStack}>{children}</div>
      )}
    </div>
  )
}
