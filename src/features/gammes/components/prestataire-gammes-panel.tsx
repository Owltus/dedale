import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
import { gammesQueries } from '../queries'
import { type OtTriable } from '@/features/ordres-travail/tri'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { GammeCard } from './gamme-card'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { listStack } from '@/lib/responsive'
import { ONGLET_ETAT_VIDE } from '@/components/common/detail-tabs-shell'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import type { MiniatureAccess } from '@/features/prestataires/components/prestataire-onglets'

/**
 * Onglet Gammes : gammes du prestataire sur le site (lien direct
 * `gammes.prestataire_id`), en LECTURE SEULE. Réutilise `GammeCard` (variante
 * Bibliothèque) — on masque le prestataire (`showPrestataire={false}`) puisqu'on
 * est déjà sur sa fiche. Le clic ouvre la fiche gamme dans le Plan de maintenance
 * via `?open=<id>` (l'explorateur reconstruit le chemin d'URL catégorie → gamme).
 * Vit côté gammes et est injecté dans la fiche prestataire par la route :
 * prestataires ne dépend pas de gammes (qui dépend, lui, de prestataires).
 */
export function PrestataireGammesPanel({
  prestataireId,
  siteId,
  urlOf,
  refreshMiniatures,
}: { prestataireId: string; siteId: string } & MiniatureAccess) {
  const navigate = useNavigate()
  const query = useQuery(gammesQueries.parPrestataire(prestataireId, siteId))

  // OT des gammes affichées → badge de statut + périodicité sur chaque carte, comme
  // dans le Plan de maintenance (MÊME variante de `GammeCard` via `statutOts`).
  const gammeIds = (query.data ?? []).map((g) => g.id)
  const otsQuery = useQuery(ordresTravailQueries.byGammes(siteId, gammeIds))
  useRealtimeRefresh('ordres_travail', ordresTravailQueries.all())
  // Badge masqué seulement pendant un vrai fetch / sur erreur (pas de statut trompeur).
  const otsIndispo = otsQuery.isLoading || otsQuery.isError
  const otsParGamme = (() => {
    const map = new Map<string, OtTriable[]>()
    for (const ot of otsQuery.data ?? []) {
      if (ot.gamme_id === null) continue
      const liste = map.get(ot.gamme_id) ?? []
      liste.push(ot)
      map.set(ot.gamme_id, liste)
    }
    return map
  })()

  return (
    <QueryState
      query={query}
      pending={<ListRowSkeletons count={3} />}
      empty={
        <EmptyState
          icon={Wrench}
          title="Aucune gamme"
          description="Aucune gamme rattachée à ce prestataire sur le site actif."
          className={ONGLET_ETAT_VIDE}
        />
      }
    >
      {(gammes) => (
        <div className={listStack}>
          {gammes.map((g) => (
            <GammeCard
              key={g.id}
              gamme={g}
              urlOf={urlOf}
              refreshMiniatures={refreshMiniatures}
              showPrestataire={false}
              // Variante « Plan de maintenance » : badge de statut + périodicité.
              statutOts={otsParGamme.get(g.id) ?? []}
              statutPending={otsIndispo}
              // Ouvre la fiche gamme dans le Plan de maintenance : on passe l'id via
              // `?open=` et l'explorateur reconstruit le chemin propre (catégorie →
              // sous-catégorie → gamme) — pas de duplication de cette logique ici.
              onClick={() =>
                void navigate({
                  to: '/gammes/$',
                  params: { _splat: '' },
                  search: { open: g.id },
                })
              }
            />
          ))}
        </div>
      )}
    </QueryState>
  )
}
