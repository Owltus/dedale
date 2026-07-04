import { useMediaQuery } from '@/hooks/use-media-query'

/** Seuil « mobile » de shadcn : en dessous, la sidebar bascule en drawer (Sheet). */
export const MOBILE_BREAKPOINT = 768

/**
 * Vrai sous 768 px : la sidebar shadcn passe alors en drawer plein écran. Bâti sur
 * `useMediaQuery` (useSyncExternalStore) → valeur correcte au premier rendu, sans
 * flash ni setState dans un effet.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`)
}
