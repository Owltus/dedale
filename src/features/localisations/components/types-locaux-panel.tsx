import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DoorOpen, Tag } from 'lucide-react'
import { localisationsQueries } from '../queries'
import { TypeLocalGabaritDialog } from './type-local-gabarit-dialog'
import { useCurrentRole } from '@/hooks/use-current-role'
import { parseChamps } from '@/lib/champs'
import { listStack } from '@/lib/responsive'
import * as perm from '@/lib/permissions'
import { ListRow } from '@/components/common/list-row'
import { EmptyState } from '@/components/common/empty-state'
import { QueryState } from '@/components/common/query-state'
import { ListRowSkeletons } from '@/components/common/list-row-skeletons'
import { Badge } from '@/components/ui/badge'
import type { Database } from '@/lib/database.types'

type TypeLocal = Database['public']['Tables']['types_locaux']['Row']

/**
 * Panneau « Types de locaux » de la Bibliothèque : le référentiel des types
 * (chambre, local technique, parking…) et, pour chacun, le GABARIT des
 * caractéristiques que porteront les locaux de ce type (112). Lecture ouverte
 * à tous les rôles ; l'édition du gabarit est réservée à l'admin, comme la
 * policy `types_locaux_admin_write` l'impose déjà côté base.
 */
export function TypesLocauxPanel() {
  const { data: role } = useCurrentRole()
  const canEdit = perm.canManageAdmin(role)
  const query = useQuery(localisationsQueries.typesLocaux())
  const { data: nbParType } = useQuery(localisationsQueries.nbLocauxParType())
  const [edite, setEdite] = useState<TypeLocal | null>(null)

  // Le dialog ne vit jamais sous une garde qui peut tomber pendant qu'il est
  // ouvert : si le rôle change (ou la donnée disparaît), on le ferme pendant
  // le rendu plutôt que de le démonter ouvert.
  if (edite !== null && !canEdit) setEdite(null)

  const champsParType = useMemo(
    () =>
      new Map(
        (query.data ?? []).map((t) => [t.id, parseChamps(t.specifications)]),
      ),
    [query.data],
  )

  return (
    <>
      <QueryState
        query={query}
        pending={<ListRowSkeletons count={6} />}
        empty={
          <EmptyState
            icon={Tag}
            title="Aucun type de local"
            description="Le référentiel des types de locaux est vide."
          />
        }
      >
        {(types) => (
          <div className={listStack}>
            {types.map((t) => {
              const champs = champsParType.get(t.id) ?? []
              const nb = nbParType?.get(t.id) ?? 0
              return (
                <ListRow
                  key={t.id}
                  media={<DoorOpen className="size-10" />}
                  title={t.libelle}
                  subtitle={
                    champs.length > 0
                      ? champs.map((c) => c.cle).join(' · ')
                      : (t.description ?? undefined)
                  }
                  meta={
                    nb > 0
                      ? `${String(nb)} ${nb > 1 ? 'locaux' : 'local'}`
                      : undefined
                  }
                  mobileMeta={
                    nb > 0
                      ? `${String(nb)} ${nb > 1 ? 'locaux' : 'local'}`
                      : undefined
                  }
                  badges={
                    <Badge variant="outline">
                      {champs.length === 0
                        ? 'Aucune caractéristique'
                        : `${String(champs.length)} caractéristique${champs.length > 1 ? 's' : ''}`}
                    </Badge>
                  }
                  onClick={canEdit ? () => setEdite(t) : undefined}
                />
              )
            })}
          </div>
        )}
      </QueryState>
      {canEdit && edite !== null && (
        <TypeLocalGabaritDialog
          key={edite.id}
          open
          onOpenChange={(o) => {
            if (!o) setEdite(null)
          }}
          type={edite}
          nbLocaux={nbParType?.get(edite.id) ?? 0}
        />
      )}
    </>
  )
}
