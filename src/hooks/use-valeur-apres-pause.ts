import { useEffect, useState } from 'react'

/** Délai d'attente des recherches envoyées à la base (ms). */
export const PAUSE_RECHERCHE_MS = 250

/**
 * `valeur`, mais seulement une fois qu'elle n'a plus bougé pendant `ms` : la
 * base n'est interrogée qu'à la fin de la frappe, pas à chaque lettre.
 */
export function useValeurApresPause<T>(valeur: T, ms: number): T {
  const [stable, setStable] = useState(valeur)
  useEffect(() => {
    const t = setTimeout(() => setStable(valeur), ms)
    return () => clearTimeout(t)
  }, [valeur, ms])
  return stable
}
