import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Requêtes propres au tableau de bord (agrégats du site actif).
 *
 * Les compteurs d'OT sont calculés côté client à partir de
 * `ordresTravailQueries.list(siteId)` (pas de requête dédiée ici) ; ce module
 * couvre les données que le tableau de bord est seul à consommer :
 * contrats proches échéance et derniers documents.
 */
export const dashboardQueries = {
  all: () => ['dashboard'] as const,

  /**
   * Contrats actifs du site dont la date de fin approche (fenêtre glissante).
   * Filtrage de la fenêtre côté client (dépend de la date du jour, non
   * stockable proprement dans la clé sans la figer).
   */
  contratsEcheance: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...dashboardQueries.all(),
        'contrats-echeance',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('contrats')
          .select(
            'id, reference, date_fin, prestataire_id, est_archive, types_contrats(id, libelle), prestataires(id, libelle)',
          )
          .eq('site_id', siteId!)
          .eq('est_archive', false)
          .not('date_fin', 'is', null)
          .order('date_fin', { ascending: true })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /** Cinq derniers documents ajoutés au site actif. */
  derniersDocuments: (siteId: string | null) =>
    queryOptions({
      queryKey: [
        ...dashboardQueries.all(),
        'derniers-documents',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('documents')
          .select('id, nom_original, mime_type, uploaded_at')
          .eq('site_id', siteId!)
          .is('deleted_at', null)
          .order('uploaded_at', { ascending: false })
          .limit(5)
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
