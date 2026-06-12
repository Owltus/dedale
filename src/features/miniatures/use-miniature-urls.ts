import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { miniaturesQueries } from './queries'

/**
 * Résout les URL signées des miniatures du pool (chargé/caché une seule fois,
 * partagé avec l'onglet Vignettes et le sélecteur d'image) et expose un accès
 * par `miniature_id`. Réutilise `miniaturesQueries.pool()` qui signe déjà les URL
 * EN LOT (un `createSignedUrls`), donc aucune signature par card.
 *
 * `refresh` ré-invalide le pool (force une re-signature) — à brancher sur
 * l'`onError` des `<img>` pour couvrir l'expiration des URL signées (~1h).
 */
export function useMiniatureUrls() {
  const qc = useQueryClient()
  const { data } = useQuery(miniaturesQueries.pool())
  // Propagation LIVE des changements du pool (ajout, suppression, REMPLACEMENT
  // d'image = UPDATE de la table miniatures) : invalide le pool partagé → toutes
  // les images résolues par `urlOf` basculent sans F5, y compris entre fenêtres /
  // comptes. Centralisé ici pour couvrir TOUT consommateur de vignettes (cartes
  // de la Bibliothèque, champ image…) sans recâbler chaque écran.
  useRealtimeRefresh('miniatures', miniaturesQueries.all())

  const urlById = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const m of data ?? []) map.set(m.id, m.url)
    return map
  }, [data])

  const urlOf = useCallback(
    (id: string | null): string | null =>
      id !== null ? (urlById.get(id) ?? null) : null,
    [urlById],
  )

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: miniaturesQueries.all() })
  }, [qc])

  return { urlOf, refresh }
}
