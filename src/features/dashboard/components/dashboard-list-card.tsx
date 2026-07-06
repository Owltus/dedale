import { useRef, type ComponentType, type ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import type { UseQueryResult } from '@tanstack/react-query'
import { QueryState } from '@/components/common/query-state'
import { EmptyState } from '@/components/common/empty-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { listStack } from '@/lib/responsive'
import { cn } from '@/lib/utils'
import { DashboardCard } from './dashboard-card'
import { HAUTEUR_LIGNE_XS, useLignesVisibles } from '../use-lignes-visibles'

interface DashboardListCardProps<T> {
  /** Requête liste (tableau) ; pilote les 4 états via `QueryState`. */
  query: UseQueryResult<T[]>
  /** État vide (« aucune donnée ») — CENTRÉ dans la carte (`flex-1` + `justify-center`). */
  emptyIcon: ComponentType<LucideProps>
  emptyTitle: string
  emptyDescription: string
  /**
   * Contenu rendu AU-DESSUS de la zone de liste (ex. alerte). Sa présence ajoute le
   * `gap-3` entre lui et la liste (calque du `contentClassName` d'origine des Documents).
   */
  header?: ReactNode
  /** Contenu rendu APRÈS la zone de liste, dans la carte (ex. dialog d'aperçu). */
  after?: ReactNode
  /**
   * Mappe les données en LIGNES. `nbLignes` = nombre que la place permet (fit-to-height) :
   * l'appelant tranche/ordonne lui-même (certaines listes réordonnent avant de trancher).
   * Le retour est enveloppé par la brique dans `listStack`.
   */
  children: (items: T[], nbLignes: number) => ReactNode
}

/**
 * Carte de liste du tableau de bord (colonnes Demandes / Documents) : mutualise le
 * FIT-TO-HEIGHT (zone `min-h-0 flex-1 overflow-hidden` mesurée par `useLignesVisibles`)
 * et le bornage `md:min-h-0 md:flex-1` / marges `py-3`/`px-3` de la carte, pour que le
 * comportement fill-or-scroll (piloté par `dashboard.tsx`) reste STRICTEMENT identique
 * entre les deux colonnes. Seul le mapping des lignes (+ en-tête/après optionnels)
 * diffère d'un appelant à l'autre.
 */
export function DashboardListCard<T>({
  query,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  header,
  after,
  children,
}: DashboardListCardProps<T>) {
  const zoneRef = useRef<HTMLDivElement>(null)
  const nbLignes = useLignesVisibles(zoneRef, HAUTEUR_LIGNE_XS)

  return (
    <DashboardCard
      // Marges internes réduites (24 → 12 px) : `py-3` (surcharge le `py-6` de la carte)
      // + `px-3` via le contentClassName. `md:min-h-0 md:flex-1` = bornage fill-or-scroll.
      className="py-3 md:min-h-0 md:flex-1"
      contentClassName={cn('flex min-h-0 flex-col px-3', header && 'gap-3')}
    >
      {header}
      <div
        ref={zoneRef}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <QueryState
          query={query}
          pending={<ListRowSkeletons count={4} dense />}
          errorClassName="py-6"
          empty={
            // `flex-1` → l'état vide occupe toute la hauteur ; son `justify-center` interne
            // le centre alors verticalement (et horizontalement).
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              description={emptyDescription}
              className="flex-1"
            />
          }
        >
          {(items) => <div className={listStack}>{children(items, nbLignes)}</div>}
        </QueryState>
      </div>
      {after}
    </DashboardCard>
  )
}
