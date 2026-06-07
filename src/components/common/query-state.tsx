import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { ErrorState } from '@/components/common/error-state'

interface QueryStateProps<T> {
  query: UseQueryResult<T>
  /** Rendu pendant le chargement (ex. <CardSkeletons />). */
  pending: ReactNode
  /** Rendu quand `data` est un tableau vide (« aucune donnée »). Optionnel. */
  empty?: ReactNode
  /** Classe transmise à l'ErrorState par défaut (ex. `py-6` dans une carte). */
  errorClassName?: string
  /** Rendu des données (`data` est garanti défini ici). */
  children: (data: T) => ReactNode
}

/**
 * Implémente la règle des 4 états d'une requête (cf. docs/conventions/ui.md) :
 * chargement → `pending`, erreur → ErrorState avec retry, tableau vide →
 * `empty`, sinon le contenu via render-prop. Le conteneur (grille/liste) et le
 * cas « aucun résultat de recherche » restent à la charge de l'appelant.
 */
export function QueryState<T>({
  query,
  pending,
  empty,
  errorClassName,
  children,
}: QueryStateProps<T>) {
  if (query.isPending) return <>{pending}</>
  if (query.isError)
    return (
      <ErrorState
        onRetry={() => void query.refetch()}
        className={errorClassName}
      />
    )
  if (empty && Array.isArray(query.data) && query.data.length === 0) {
    return <>{empty}</>
  }
  return <>{children(query.data)}</>
}
