import { queryOptions, skipToken } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { clesRacines } from '@/lib/cles-racines'

/**
 * Lectures propres aux opérations d'une gamme (table `operations`). Les clés
 * restent SOUS la racine des gammes (`clesRacines.gammes`) : les écritures du
 * Plan de maintenance les rafraîchissent sans câblage supplémentaire.
 */
export const operationsQueries = {
  /**
   * Identifiants SEULS des opérations d'une gamme — de quoi savoir si le
   * `source_id` d'une exécution pointe encore une opération vivante.
   *
   * Sert à l'ADR 0012 : la base autorise explicitement la suppression d'une
   * opération référencée par des exécutions, et la fiche d'OT doit pouvoir
   * DIRE « historique indisponible, l'opération d'origine a été supprimée »
   * plutôt que d'afficher un tiret qu'on confond avec une première mesure.
   * C'est le seul moyen d'affirmer cette cause sans la deviner.
   *
   * Volontairement minimal (une colonne) et mis en cache : appelé sur chaque
   * fiche d'OT porteuse de compteurs.
   */
  idsOperations: (gammeId: string | null) =>
    queryOptions({
      queryKey: [...clesRacines.gammes(), 'operations-ids', gammeId] as const,
      queryFn:
        gammeId === null
          ? skipToken
          : async ({ signal }) => {
              const { data } = await supabase
                .from('operations')
                .select('id')
                .eq('gamme_id', gammeId)
                .abortSignal(signal)
                .throwOnError()
              return new Set(data.map((o) => o.id))
            },
      staleTime: 60_000,
    }),
}
