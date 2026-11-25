import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen } from 'lucide-react'
import { localisationsQueries } from '../queries'
import { caracteristiquesLocal, surfaceLocal } from '../lieu-format'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'
import { DetailHeaderCard } from '@/components/common/detail-header-card'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * FICHE d'un lieu, 3ᵉ palier de l'arbre des localisations
 * (`/localisations/<bâtiment>/<niveau>/<lieu>`). L'en-tête de page (fil
 * d'Ariane, titre = nom du lieu) reste porté par l'explorateur parent ; ce
 * composant rend la carte d'en-tête (chemin, type, surface, caractéristiques)
 * puis l'emplacement des ONGLETS (`onglets`), fournis par l'hôte.
 */
export function LieuFiche({
  localId,
  onglets,
}: {
  localId: string
  /** Onglets de la fiche (coquille `DetailTabsShell` sans `headerCard`). */
  onglets?: ReactNode
}) {
  const lieuQuery = useQuery(localisationsQueries.local(localId))
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()

  return (
    <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6 lg:px-8">
      <QueryState
        query={lieuQuery}
        pending={<Skeleton className="mb-4 h-20 w-full rounded-lg" />}
      >
        {(lieu) =>
          lieu === null ? (
            <EmptyState
              icon={DoorOpen}
              title="Lieu introuvable"
              description="Ce lieu n’existe plus ou n’est pas visible avec tes accès."
            />
          ) : (
            <>
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
              {onglets}
            </>
          )
        }
      </QueryState>
    </div>
  )
}
