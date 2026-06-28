import { Folder, Inbox } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { ListRow } from '@/components/common/list-row'
import { ScopeBadges } from '@/components/common/scope-badges'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'

/**
 * Champs minimaux lus par une carte catégorie/sous-catégorie. Structurellement
 * compatible avec la projection `DrillCat` de l'explorateur ET la `Categorie`
 * complète de la Bibliothèque (typage par structure).
 */
export interface CategorieCardData {
  nom: string
  description: string | null
  miniature_id: string | null
  site_id: string | null
}

/**
 * Carte (ListRow média) d'une CATÉGORIE de gammes : vignette dossier + nom +
 * description + (option) badges de périmètre. Source UNIQUE du rendu d'une
 * catégorie → liste de l'explorateur du Plan de maintenance ET de la Bibliothèque.
 * Le bac virtuel « Non classé » est rendu via `virtual` (icône Inbox, sans
 * vignette ni badge). Garantit un visuel identique partout : une modification ici
 * se répercute aux deux listes.
 */
export function CategorieCard({
  categorie,
  urlOf,
  refreshMiniatures,
  onClick,
  menuActions,
  showScopeBadges = false,
  virtual = false,
}: {
  categorie: CategorieCardData
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
  onClick?: () => void
  menuActions?: RowAction[]
  /**
   * Affiche les badges de périmètre (Commun / Site). `false` en Bibliothèque, où
   * tout est commun (entreprise) → un badge serait redondant.
   */
  showScopeBadges?: boolean
  /**
   * Bac virtuel « Non classé » (catégorie hors base regroupant les gammes sans
   * catégorie visible) : icône Inbox, sans vignette ni badge de périmètre.
   */
  virtual?: boolean
}) {
  const badges =
    showScopeBadges && !virtual ? (
      <ScopeBadges siteId={categorie.site_id} />
    ) : undefined
  return (
    <ListRow
      media={
        <MiniatureThumb
          url={virtual ? null : urlOf(categorie.miniature_id)}
          fallback={
            virtual ? (
              <Inbox className="size-10" />
            ) : (
              <Folder className="size-10" />
            )
          }
          alt=""
          onError={refreshMiniatures}
          className="size-full rounded-none"
        />
      }
      title={categorie.nom}
      subtitle={
        categorie.description?.trim() ? categorie.description.trim() : undefined
      }
      badges={badges}
      mobileMeta={badges}
      onClick={onClick}
      menuActions={menuActions}
    />
  )
}
