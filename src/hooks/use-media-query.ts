import { useSyncExternalStore } from 'react'

/**
 * Indique si une media query CSS correspond, et réagit aux changements de taille
 * (via useSyncExternalStore — pas de setState dans un effet, pas de flash).
 * Exemple : `useMediaQuery('(min-width: 1024px)')`.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onStoreChange)
      return () => mql.removeEventListener('change', onStoreChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
