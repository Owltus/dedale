import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type Miniature = Database['public']['Tables']['miniatures']['Row']

type PoolRow = Database['public']['Views']['v_miniatures_pool']['Row']

/** Vignette du pool enrichie de son usage + URL signée d'affichage. */
export interface MiniatureWithUrl {
  id: string
  site_id: string | null
  hash_sha256: string
  storage_path: string
  created_at: string
  created_by: string | null
  /** Familles d'entités qui référencent la vignette (vide = inutilisée). */
  origines: string[]
  /** Noms des entités liées, concaténés — cible de la recherche. */
  libelles: string
  /** URL signée d'affichage (bucket privé), null si non résolue. */
  url: string | null
}

// Les colonnes d'une VUE sont typées `| null` par Supabase : on écarte les lignes
// dont les champs structurants manquent (ne devrait jamais arriver : la vue part
// de la table miniatures où ils sont NOT NULL) pour obtenir un type net ensuite.
function isComplete(
  r: PoolRow,
): r is PoolRow & {
  id: string
  hash_sha256: string
  storage_path: string
  created_at: string
} {
  return (
    r.id !== null &&
    r.hash_sha256 !== null &&
    r.storage_path !== null &&
    r.created_at !== null
  )
}

export const miniaturesQueries = {
  all: () => ['miniatures'] as const,

  /**
   * Pool de vignettes visible (RLS : commun + sites de l'utilisateur), enrichi de
   * l'usage (origines + libellés liés) via la vue `v_miniatures_pool`. Le filtrage
   * par périmètre / origine / recherche se fait côté composant. Résout une URL
   * signée par image (bucket « documents » privé).
   */
  pool: () =>
    queryOptions({
      queryKey: [...miniaturesQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }): Promise<MiniatureWithUrl[]> => {
        const { data } = await supabase
          .from('v_miniatures_pool')
          .select('*')
          .order('created_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        const rows = data.filter(isComplete)
        if (rows.length === 0) return []

        const { data: signed, error: signError } = await supabase.storage
          .from('documents')
          .createSignedUrls(
            rows.map((m) => m.storage_path),
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
        return rows.map((m) => ({
          id: m.id,
          site_id: m.site_id,
          hash_sha256: m.hash_sha256,
          storage_path: m.storage_path,
          created_at: m.created_at,
          created_by: m.created_by,
          origines: m.origines ?? [],
          libelles: m.libelles ?? '',
          url: urlByPath.get(m.storage_path) ?? null,
        }))
      },
      staleTime: 60_000,
    }),
}
