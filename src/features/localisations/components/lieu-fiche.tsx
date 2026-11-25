import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen } from 'lucide-react'
import { localisationsQueries } from '../queries'
import { caracteristiquesLocal, surfaceLocal } from '../lieu-format'
import {
  ongletsVisibles,
  type OngletLieu,
  type OngletLieuProps,
  type OngletsDuLieu,
} from '../fiche-lieu'
import { LieuOngletDocuments } from './lieu-onglet-documents'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { DetailTabsShell } from '@/components/common/detail-tabs-shell'
import { ErrorState } from '@/components/common/error-state'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * FICHE d'un lieu, 3ᵉ palier de l'arbre des localisations
 * (`/localisations/<bâtiment>/<niveau>/<lieu>`). L'en-tête de page (fil
 * d'Ariane, titre = nom du lieu, bouton + de l'onglet actif) reste porté par
 * l'explorateur parent ; ce composant rend la coquille `DetailTabsShell` :
 * carte d'en-tête (chemin, type, surface, caractéristiques) puis les onglets.
 *
 * Onglets et pastilles viennent de `fiche_local` : un compteur `null` (rôle
 * sans accès, ex. demandeur) MASQUE l'onglet. Les onglets métier sont
 * INJECTÉS (`onglets`, par la route) : localisations n'importe aucune des
 * features qui les portent. Documents vit ici (feature socle).
 */
export function LieuFiche({
  localId,
  siteId,
  onglets,
}: {
  localId: string
  siteId: string
  /** Onglets métier, fournis par la route. Absents → en-tête seul. */
  onglets?: OngletsDuLieu
}) {
  const lieuQuery = useQuery(localisationsQueries.local(localId))
  // Compteurs lus seulement quand la fiche a des onglets à chiffrer.
  const ficheQuery = useQuery(
    localisationsQueries.fiche(onglets ? localId : null),
  )
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  const [choisi, setChoisi] = useState<OngletLieu>('equipements')
  // Compteurs en direct : une DI, un OT, un travaux ou un événement écrit
  // ailleurs (ou depuis un onglet) met les pastilles à jour.
  const cleFiche = localisationsQueries.fiche(localId).queryKey
  useRealtimeRefresh('demandes_intervention', cleFiche)
  useRealtimeRefresh('ordres_travail', cleFiche)
  useRealtimeRefresh('interventions_travaux', cleFiche)
  useRealtimeRefresh('evenements', cleFiche)

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6 lg:px-8">
      <QueryState
        query={lieuQuery}
        pending={<Skeleton className="mb-4 h-20 w-full rounded-lg" />}
      >
        {(lieu) => {
          if (lieu === null)
            return (
              <EmptyState
                icon={DoorOpen}
                title="Lieu introuvable"
                description="Ce lieu n’existe plus ou n’est pas visible avec tes accès."
              />
            )
          const entete = (
            <DetailHeaderCard
              columns={2}
              thumbnail={
                <MiniatureThumb
                  url={urlOf(lieu.miniature_id)}
                  fallback={<DoorOpen className="size-10" />}
                  alt=""
                  onError={refreshMiniatures}
                  className="size-full rounded-none"
                />
              }
              fields={[
                {
                  label: 'Chemin',
                  value: lieu.chemin_complet ?? lieu.chemin_court,
                },
                { label: 'Type', value: lieu.type_local },
                { label: 'Surface', value: surfaceLocal(lieu) },
                {
                  label: 'Caractéristiques',
                  value: caracteristiquesLocal(lieu).join(' · ') || null,
                },
              ]}
            />
          )
          if (!onglets) return entete
          if (ficheQuery.isPending)
            return (
              <>
                {entete}
                <Skeleton className="mb-4 h-10 w-full rounded-lg" />
              </>
            )
          if (ficheQuery.isError)
            return (
              <>
                {entete}
                <ErrorState onRetry={() => void ficheQuery.refetch()} />
              </>
            )
          const visibles = ficheQuery.data
            ? ongletsVisibles(ficheQuery.data)
            : []
          // Onglet choisi masqué (rôle) ou absent → le premier visible.
          const actif =
            visibles.find((o) => o.id === choisi)?.id ?? visibles[0]?.id
          if (actif === undefined) return entete
          const props: OngletLieuProps = {
            localId,
            siteId,
            total: visibles.find((o) => o.id === actif)?.total ?? 0,
          }
          const Corps = {
            equipements: onglets.Equipements,
            gammes: onglets.Gammes,
            ot: onglets.Ot,
            di: onglets.Demandes,
            travaux: onglets.Travaux,
            evenements: onglets.Evenements,
            documents: null,
          }[actif]
          return (
            <DetailTabsShell
              tabsAriaLabel="Sections du lieu"
              headerCard={entete}
              items={visibles.map(({ id, label, count }) => ({
                id,
                label,
                count,
              }))}
              value={actif}
              onValueChange={setChoisi}
            >
              {() =>
                Corps === null ? (
                  <LieuOngletDocuments localId={localId} />
                ) : (
                  <Corps key={actif} {...props} />
                )
              }
            </DetailTabsShell>
          )
        }}
      </QueryState>
    </div>
  )
}
