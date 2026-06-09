import { useEffect, useId, useRef } from 'react'
import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Rafraîchit une liste en LIVE : s'abonne aux changements Realtime de `table`
 * (Postgres) et invalide `queryKey` à chaque INSERT/UPDATE/DELETE → la vue se met
 * à jour entre onglets ET entre utilisateurs, sans F5.
 *
 * Bonnes pratiques intégrées :
 * - l'abonnement vit avec le composant (souscription au montage, fermeture au
 *   démontage) → une connexion WebSocket UNIQUEMENT quand l'écran est ouvert ;
 * - un seul canal par instance (`useId`), stable même si la clé change de
 *   référence à chaque rendu (on garde la dernière via une ref).
 *
 * Pré-requis backend : `table` doit appartenir à la publication
 * `supabase_realtime` (+ REPLICA IDENTITY FULL pour diffuser aussi les
 * suppressions sous RLS). Cf. SQL d'activation.
 *
 * Usage : `useRealtimeRefresh('miniatures', miniaturesQueries.all())`
 */
export function useRealtimeRefresh(table: string, queryKey: QueryKey) {
  const qc = useQueryClient()
  const id = useId()
  const keyRef = useRef(queryKey)
  useEffect(() => {
    keyRef.current = queryKey
  }, [queryKey])

  useEffect(() => {
    const channel = supabase
      .channel(`rt:${table}:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => void qc.invalidateQueries({ queryKey: keyRef.current }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [table, id, qc])
}
