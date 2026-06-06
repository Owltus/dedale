# Étape 1 — Primitive QueryState + skeletons

## Objectif

Créer le composant `QueryState` (règle des 4 états) et le helper `CardSkeletons`,
sans migrer encore aucun écran.

## Fichier(s) impacté(s)

- `src/components/common/query-state.tsx` (nouveau)
- `src/components/common/card-skeletons.tsx` (nouveau)

## Travail à réaliser

### 1. `query-state.tsx`

Composant générique en render-prop. Accepte le résultat de `useQuery`
(`UseQueryResult<T>` de `@tanstack/react-query`) et rend l'un des 4 états.

```tsx
import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { ErrorState } from '@/components/common/error-state'

interface QueryStateProps<T> {
  query: UseQueryResult<T>
  /** Rendu pendant le chargement (ex. <CardSkeletons />). */
  pending: ReactNode
  /** Rendu quand data est un tableau vide (« aucune donnée »). Optionnel. */
  empty?: ReactNode
  /** Rendu des données (data garanti défini ici). */
  children: (data: T) => ReactNode
}

export function QueryState<T>({
  query,
  pending,
  empty,
  children,
}: QueryStateProps<T>) {
  if (query.isPending) return <>{pending}</>
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />
  if (empty && Array.isArray(query.data) && query.data.length === 0) {
    return <>{empty}</>
  }
  return <>{children(query.data)}</>
}
```

Vérifier le narrowing TS : après `isPending`/`isError`, `query.data` doit être
`T` (discriminated union v5). Si le narrowing ne passe pas en strict, ajuster
(ex. garde explicite `query.isSuccess`).

### 2. `card-skeletons.tsx`

```tsx
import { cardGrid } from '@/lib/responsive'
import { Skeleton } from '@/components/ui/skeleton'

interface CardSkeletonsProps {
  count?: number
  /** Hauteur de chaque squelette (classe Tailwind). */
  height?: string
  /** Conteneur (grille ou liste). Défaut : cardGrid.default. */
  container?: string
}

export function CardSkeletons({
  count = 4,
  height = 'h-40',
  container = cardGrid.default,
}: CardSkeletonsProps) {
  return (
    <div className={container}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  )
}
```

## Critère de validation

- `npx tsc -b` et `npx eslint .` passent.
- `QueryState` et `CardSkeletons` importables via `@/`.
- Aucun écran modifié à cette étape.
