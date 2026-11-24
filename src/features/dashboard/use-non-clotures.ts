import { queryOptions, useQuery, skipToken } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { demandesQueries } from '@/features/demandes/queries'
import { STATUTS_DI_TERMINAUX } from '@/features/demandes/etat'
import { travauxQueries } from '@/features/travaux/queries'
import { STATUTS_TRAVAUX_TERMINAUX } from '@/features/travaux/etat'
import { evenementsQueries } from '@/features/evenements/queries'
import { STATUTS_EVENEMENTS_TERMINAUX } from '@/features/evenements/etat'

type Table = 'demandes_intervention' | 'interventions_travaux' | 'evenements'

/**
 * Nombre de lignes NON clôturées du site — un simple comptage (`head: true`,
 * aucune ligne transférée) : la sidebar l'interroge sur toutes les pages.
 *
 * La clé vit SOUS celle de la feature (`[...all(), 'non-clotures', site]`) : toute
 * mutation qui invalide la feature rafraîchit donc aussi la pastille.
 */
function nonClotures(
  all: readonly string[],
  table: Table,
  colonneStatut: string,
  terminaux: readonly number[],
  siteId: string | null,
) {
  return queryOptions({
    queryKey: [...all, 'non-clotures', siteId] as const,
    queryFn:
      siteId === null
        ? skipToken
        : async ({ signal }) => {
            const { count } = await supabase
              .from(table)
              .select('id', { count: 'exact', head: true })
              .eq('site_id', siteId)
              .not(colonneStatut, 'in', `(${terminaux.join(',')})`)
              .abortSignal(signal)
              .throwOnError()
            return count ?? 0
          },
  })
}

export interface NonClotures {
  demandes: number
  travaux: number
  evenements: number
}

/**
 * Compteurs « à traiter » de la sidebar et des onglets du tableau de bord :
 * demandes, travaux et événements du site actif encore ouverts ou en cours.
 * Tenues à jour en direct (canaux temps réel partagés avec le reste de l'app).
 */
export function useNonClotures(siteId: string | null): NonClotures {
  useRealtimeRefresh('demandes_intervention', demandesQueries.all())
  useRealtimeRefresh('interventions_travaux', travauxQueries.all())
  useRealtimeRefresh('evenements', evenementsQueries.all())

  const { data: demandes = 0 } = useQuery(
    nonClotures(
      demandesQueries.all(),
      'demandes_intervention',
      'statut_di_id',
      STATUTS_DI_TERMINAUX,
      siteId,
    ),
  )
  const { data: travaux = 0 } = useQuery(
    nonClotures(
      travauxQueries.all(),
      'interventions_travaux',
      'statut_travaux_id',
      STATUTS_TRAVAUX_TERMINAUX,
      siteId,
    ),
  )
  const { data: evenements = 0 } = useQuery(
    nonClotures(
      evenementsQueries.all(),
      'evenements',
      'statut_evenement_id',
      STATUTS_EVENEMENTS_TERMINAUX,
      siteId,
    ),
  )
  return { demandes, travaux, evenements }
}
