import { Fragment, useState, type ReactNode } from 'react'
import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from '@tanstack/react-query'
import { normaliserRecherche } from '@/lib/recherche'
import { ErrorState } from '@/components/common/error-state'
import { ListPageBody } from '@/components/common/list-page-body'
import type { FilterOption } from '@/components/common/list-filter-bar'
import { Button } from '@/components/ui/button'

interface OngletPagineProps<T> {
  /** Lecture PAGINÉE (`infiniteQueryOptions`) : chaque page est un tableau. */
  query: UseInfiniteQueryResult<InfiniteData<T[]>>
  /**
   * Nombre total connu d'avance (compteur de la fiche) : `0` → état vide
   * direct, sans attendre la lecture ni proposer un filtre inutile.
   */
  total: number
  /** État vide (aucun élément, tous statuts confondus). */
  empty: ReactNode
  /** Squelette de chargement (même `size` que les lignes réelles). */
  pending: ReactNode
  /** Filtre de statut optionnel, piloté par l'hôte (il entre dans la clé). */
  filterValue?: string
  onFilterChange?: (value: string) => void
  options?: FilterOption[]
  filterLabel?: string
  searchPlaceholder: string
  /** Textes cherchés d'une ligne (casse et accents ignorés). */
  texteRecherche: (item: T) => (string | null | undefined)[]
  /** Message du 5ᵉ état (« Aucune demande ne correspond… »). */
  emptySearchDescription: string
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
}

/**
 * Corps d'un ONGLET DE FICHE paginé : les quatre états d'une lecture, la barre
 * recherche + filtre (`ListPageBody`), les lignes, puis « Afficher la suite »
 * tant que la base en a d'autres. Le filtre de statut est fait par la base
 * (l'hôte le met dans la clé) ; la recherche porte sur les lignes chargées.
 *
 * Né de la fiche d'un lieu (sept onglets bâtis à l'identique : équipements,
 * plans de maintenance, OT, DI, travaux, événements).
 */
export function OngletPagine<T>({
  query,
  total,
  empty,
  pending,
  filterValue,
  onFilterChange,
  options,
  filterLabel,
  searchPlaceholder,
  texteRecherche,
  emptySearchDescription,
  getKey,
  renderItem,
}: OngletPagineProps<T>) {
  const [recherche, setRecherche] = useState('')

  if (total === 0) return <>{empty}</>
  if (query.isPending) return <>{pending}</>
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />

  const q = normaliserRecherche(recherche)
  const lignes = query.data.pages
    .flat()
    .filter(
      (item) =>
        q === '' ||
        texteRecherche(item).some((v) =>
          normaliserRecherche(v ?? '').includes(q),
        ),
    )
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query

  return (
    <div className="flex flex-col gap-4">
      <ListPageBody
        search={recherche}
        onSearchChange={setRecherche}
        searchPlaceholder={searchPlaceholder}
        filterValue={filterValue}
        onFilterChange={onFilterChange}
        options={options}
        filterLabel={filterLabel}
        sticky
        isEmpty={lignes.length === 0}
        emptySearchDescription={emptySearchDescription}
      >
        {lignes.map((item) => (
          <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
        ))}
      </ListPageBody>
      {hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? 'Chargement…' : 'Afficher la suite'}
        </Button>
      )}
    </div>
  )
}
