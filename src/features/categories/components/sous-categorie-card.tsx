import { Folder } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { ListRow } from '@/components/common/list-row'
import { ScopeBadges } from '@/components/common/scope-badges'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import type { CategorieCardData } from './categorie-card'

/**
 * Carte (ListRow média) d'une SOUS-CATÉGORIE de gammes : vignette dossier + nom +
 * description + (option) badges de périmètre. Source UNIQUE du rendu d'une
 * sous-catégorie → liste de l'explorateur du Plan de maintenance ET de la
 * Bibliothèque. Distincte de `CategorieCard` (composant séparé) pour pouvoir
 * évoluer indépendamment plus tard (ex. compteur de gammes), tout en gardant
 * aujourd'hui un visuel homogène.
 */
export function SousCategorieCard({
  sousCategorie,
  urlOf,
  refreshMiniatures,
  onClick,
  menuActions,
  showScopeBadges = false,
}: {
  sousCategorie: CategorieCardData
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
  onClick?: () => void
  menuActions?: RowAction[]
  /**
   * Affiche les badges de périmètre (Commun / Site). `false` en Bibliothèque, où
   * tout est commun (entreprise) → un badge serait redondant.
   */
  showScopeBadges?: boolean
}) {
  const badges = showScopeBadges ? (
    <ScopeBadges siteId={sousCategorie.site_id} />
  ) : undefined
  return (
    <ListRow
      media={
        <MiniatureThumb
          url={urlOf(sousCategorie.miniature_id)}
          fallback={<Folder className="size-10" />}
          alt=""
          onError={refreshMiniatures}
          className="size-full rounded-none"
        />
      }
      title={sousCategorie.nom}
      subtitle={
        sousCategorie.description?.trim()
          ? sousCategorie.description.trim()
          : undefined
      }
      badges={badges}
      mobileMeta={badges}
      onClick={onClick}
      menuActions={menuActions}
    />
  )
}
