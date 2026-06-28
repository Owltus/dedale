import { Wrench } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { ListRow } from '@/components/common/list-row'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { Badge } from '@/components/ui/badge'
import { NATURE_GAMME_LABEL } from '../schemas'
import type { GammeRow } from './gamme-detail'

/**
 * Carte (ListRow média) d'une gamme : vignette + nom + sous-titre + nature +
 * prestataire. Source UNIQUE du rendu d'une gamme → utilisée dans la LISTE du
 * Plan de maintenance (avec drill `onClick` + `menuActions`) ET en tête de la
 * FICHE gamme (statique, sans action). Garantit un visuel identique partout.
 */
export function GammeCard({
  gamme,
  urlOf,
  refreshMiniatures,
  onClick,
  menuActions,
  showPrestataire = true,
}: {
  gamme: GammeRow
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
  onClick?: () => void
  menuActions?: RowAction[]
  /**
   * Affiche le prestataire (méta). `false` pour une gamme-template commune de la
   * Bibliothèque, qui n'en porte JAMAIS (il est renseigné après copie sur un
   * site) → on n'affiche pas un trompeur « Prestataire à renseigner ».
   */
  showPrestataire?: boolean
}) {
  return (
    <ListRow
      media={
        <MiniatureThumb
          url={urlOf(gamme.miniature_id)}
          fallback={<Wrench className="size-10" />}
          alt=""
          onError={refreshMiniatures}
          className="size-full rounded-none"
        />
      }
      title={gamme.nom}
      subtitle={
        gamme.description?.trim()
          ? gamme.description.trim()
          : (gamme.periodicites?.libelle ?? undefined)
      }
      badges={
        <Badge
          variant={
            gamme.nature === 'controle_reglementaire' ? 'default' : 'secondary'
          }
        >
          {NATURE_GAMME_LABEL[gamme.nature]}
        </Badge>
      }
      meta={
        showPrestataire ? (
          gamme.prestataires ? (
            <span className="text-sm">{gamme.prestataires.libelle}</span>
          ) : (
            <span className="text-muted-foreground text-sm">
              Prestataire à renseigner
            </span>
          )
        ) : undefined
      }
      mobileMeta={
        showPrestataire
          ? (gamme.prestataires?.libelle ?? 'Prestataire à renseigner')
          : undefined
      }
      onClick={onClick}
      menuActions={menuActions}
    />
  )
}
