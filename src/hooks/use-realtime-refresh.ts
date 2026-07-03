import { useEffect, useState } from 'react'
import {
  hashKey,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Clé enregistrée sur un canal, refcomptée entre abonnés. */
interface KeyEntry {
  key: QueryKey
  qc: QueryClient
  count: number
}

/** Canal PARTAGÉ d'une table : un seul WebSocket quel que soit le nb d'abonnés. */
interface TableSubscription {
  channel: RealtimeChannel
  subscribers: number
  /** Clés à invalider sur événement, dédupliquées par hash (une invalidation par clé). */
  keys: Map<string, KeyEntry>
}

// Registre au niveau MODULE : le premier abonné d'une table crée le canal, les
// suivants s'y greffent, le dernier démonté le ferme. Élimine la « fuite de
// canaux » (un canal par instance de hook, cf. ex-commentaire de use-dashboard-data).
const registry = new Map<string, TableSubscription>()
// Suffixe d'unicité du topic : évite toute collision si un canal d'une table est
// fermé puis recréé pendant que l'ancien se démonte côté socket.
let seq = 0

/**
 * Normalise le 2e paramètre : une `QueryKey` est ELLE-MÊME un tableau, on
 * distingue donc « une clé » d'« une liste de clés » par le contenu (liste =
 * tous les éléments sont des tableaux). Rétrocompatible avec les appels
 * mono-clé existants (`xxxQueries.all()` = tableau de chaînes).
 */
function normalizeKeys(input: QueryKey | readonly QueryKey[]): QueryKey[] {
  if (input.length > 0 && input.every((el) => Array.isArray(el))) {
    return [...(input as readonly QueryKey[])]
  }
  return [input as QueryKey]
}

/** Crée (1er abonné) ou rejoint le canal partagé de `table`. */
function acquireChannel(table: string): void {
  let entry = registry.get(table)
  if (!entry) {
    const keys = new Map<string, KeyEntry>()
    seq += 1
    const channel = supabase
      .channel(`rt:${table}:${String(seq)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          // Chaque clé enregistrée est invalidée UNE seule fois par événement
          // (la Map est dédupliquée par hash de clé).
          for (const { key, qc } of keys.values()) {
            void qc.invalidateQueries({ queryKey: key })
          }
        },
      )
      .subscribe()
    entry = { channel, subscribers: 0, keys }
    registry.set(table, entry)
  }
  entry.subscribers += 1
}

/** Quitte le canal partagé de `table` ; le dernier abonné le ferme. */
function releaseChannel(table: string): void {
  const entry = registry.get(table)
  if (!entry) return
  entry.subscribers -= 1
  if (entry.subscribers <= 0) {
    registry.delete(table)
    void supabase.removeChannel(entry.channel)
  }
}

/**
 * Enregistre des clés sur le canal de `table` (refcomptées par hash entre
 * abonnés) et renvoie la fonction de désenregistrement symétrique.
 */
function registerKeys(
  table: string,
  keys: readonly QueryKey[],
  qc: QueryClient,
): () => void {
  const entry = registry.get(table)
  if (!entry) return () => undefined
  const hashes: string[] = []
  for (const key of keys) {
    const hash = hashKey(key)
    hashes.push(hash)
    const existing = entry.keys.get(hash)
    if (existing) existing.count += 1
    else entry.keys.set(hash, { key, qc, count: 1 })
  }
  return () => {
    const current = registry.get(table)
    if (!current) return
    for (const hash of hashes) {
      const registered = current.keys.get(hash)
      if (!registered) continue
      registered.count -= 1
      if (registered.count <= 0) current.keys.delete(hash)
    }
  }
}

/**
 * Rafraîchit une liste en LIVE : s'abonne aux changements Realtime de `table`
 * (Postgres) et invalide `queryKey` — une clé OU un tableau de clés — à chaque
 * INSERT/UPDATE/DELETE → la vue se met à jour entre onglets ET entre
 * utilisateurs, sans F5.
 *
 * Bonnes pratiques intégrées :
 * - canal PARTAGÉ par table (registre au niveau module) : le premier abonné le
 *   crée, les suivants s'y greffent, le dernier démonté le ferme → un seul
 *   WebSocket par table quel que soit le nombre de composants abonnés ;
 * - chaque clé enregistrée est invalidée UNE seule fois par événement
 *   (déduplication par hash de clé, `hashKey` de TanStack Query) ;
 * - stable même si la clé change de référence à chaque rendu (réenregistrement
 *   uniquement quand son CONTENU change).
 *
 * Pré-requis backend : `table` doit appartenir à la publication
 * `supabase_realtime` (+ REPLICA IDENTITY FULL pour diffuser aussi les
 * suppressions sous RLS). Cf. SQL d'activation.
 *
 * Usage :
 * - `useRealtimeRefresh('miniatures', miniaturesQueries.all())`
 * - `useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)` (plusieurs clés)
 */
export function useRealtimeRefresh(
  table: string,
  queryKey: QueryKey | readonly QueryKey[],
): void {
  const qc = useQueryClient()
  const keys = normalizeKeys(queryKey)
  // Référence STABILISÉE par contenu : les appelants passent des clés inline
  // (nouvelle référence à chaque rendu) → on ne garde une nouvelle référence
  // (donc on ne réenregistre) que si le hash de contenu change réellement.
  // Pattern « ajuster l'état pendant le rendu » (cf. confirm-delete-dialog).
  const hash = keys.map(hashKey).join('|')
  const [stable, setStable] = useState({ hash, keys })
  if (stable.hash !== hash) setStable({ hash, keys })
  const stableKeys = stable.keys

  // Cycle de vie du canal partagé (indépendant des clés : pas de re-souscription
  // WebSocket quand seules les clés changent).
  useEffect(() => {
    acquireChannel(table)
    return () => releaseChannel(table)
  }, [table])

  // Enregistrement des clés sur le canal (posé APRÈS l'acquisition : les effets
  // s'exécutent dans l'ordre de déclaration).
  useEffect(() => {
    return registerKeys(table, stableKeys, qc)
  }, [table, qc, stableKeys])
}
