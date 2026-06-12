import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type Miniature = Database['public']['Tables']['miniatures']['Row']
export interface MiniatureWithUrl extends Miniature {
  /** URL signée d'affichage (bucket privé), null si non résolue. */
  url: string | null
}

export const miniaturesQueries = {
  all: () => ['miniatures'] as const,

  /**
   * Tout le pool de miniatures visible (RLS : scope commun `site_id NULL` + tous
   * les sites de l'utilisateur). Le filtrage par périmètre se fait côté
   * composant. Résout une URL signée par image (le bucket « documents » est privé).
   */
  pool: () =>
    queryOptions({
      queryKey: [...miniaturesQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }): Promise<MiniatureWithUrl[]> => {
        const { data } = await supabase
          .from('miniatures')
          .select('*')
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        if (data.length === 0) return []

        const { data: signed, error: signError } = await supabase.storage
          .from('documents')
          .createSignedUrls(
            data.map((m) => m.storage_path),
            3600,
          )
        // Erreur de niveau LOT (réseau, JWT, bucket absent…) : on la propage. Les
        // erreurs PAR CHEMIN restent dans `signed[i].error` et retombent
        // gracieusement sur `url: null` (vignette → fallback).
        if (signError !== null) throw signError
        const urlByPath = new Map<string, string>()
        for (const item of signed) {
          if (item.path && item.signedUrl)
            urlByPath.set(item.path, item.signedUrl)
        }
        return data.map((m) => ({
          ...m,
          url: urlByPath.get(m.storage_path) ?? null,
        }))
      },
      staleTime: 60_000,
    }),
}
