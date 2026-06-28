import { Folder } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { ListRow } from '@/components/common/list-row'
import { ScopeBadges } from '@/components/common/scope-badges'
import {
  StatusBadge,
  type StatusTone,
} from '@/components/common/status-badge'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import type { CategorieCardData } from './categorie-card'

/**
 * Carte (ListRow média) d'une SOUS-CATÉGORIE de gammes : vignette dossier + nom +
 * description + (option) badge de STATUT agrégé OU badges de périmètre. Source
 * UNIQUE du rendu d'une sous-catégorie → liste de l'explorateur du Plan de
 * maintenance ET de la Bibliothèque. Distincte de `CategorieCard` (composant
 * séparé) pour pouvoir évoluer indépendamment.
 *
 * Deux variantes :
 *  - `statut` (ou `statutPending`) FOURNI → mode « Plan de maintenance » : badge de
 *    statut temporel à droite (synthèse du pire cas des gammes, calculée par le
 *    conteneur), badges de périmètre masqués ;
 *  - SINON → mode « Bibliothèque » : badges de périmètre selon `showScopeBadges`.
 */
export function SousCategorieCard({
  sousCategorie,
  urlOf,
  refreshMiniatures,
  onClick,
  menuActions,
  showScopeBadges = false,
  statut,
  statutPending = false,
}: {
  sousCategorie: CategorieCardData
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
  onClick?: () => void
  menuActions?: RowAction[]
  /**
   * Affiche les badges de périmètre (Commun / Site). `false` en Bibliothèque, où
   * tout est commun (entreprise) → un badge serait redondant. Ignoré en mode statut.
   */
  showScopeBadges?: boolean
  /**
   * Statut temporel agrégé (libellé + tonalité), calculé par le conteneur via
   * `statutAffichageAgrege`. Sa présence — ou `statutPending` — bascule la
   * carte en mode « statut » (badge à droite, périmètre masqué).
   */
  statut?: { label: string; tone: StatusTone }
  /**
   * Chargement des OT en cours : on garde le mode statut (mise en page stable) mais
   * on masque le badge le temps du fetch (pas d'état trompeur avant les données).
   */
  statutPending?: boolean
}) {
  const statutMode = statut !== undefined || statutPending
  const description = sousCategorie.description?.trim()
    ? sousCategorie.description.trim()
    : undefined
  const scope = showScopeBadges ? (
    <ScopeBadges siteId={sousCategorie.site_id} />
  ) : undefined

  const badges = statutMode
    ? (
        // Colonne à largeur FIXE et centrée — MÊME gabarit que la carte OT : le badge
        // reste centré et ALIGNÉ d'une carte à l'autre malgré des libellés de
        // longueurs différentes (« Vide » vs « En retard » vs « À assigner »). La
        // colonne est rendue même pendant le chargement (badge masqué) → pas de
        // décalage quand il apparaît.
        <div className="flex w-36 flex-col items-center text-center">
          {statut && (
            <StatusBadge tone={statut.tone} className="shrink-0">
              {statut.label}
            </StatusBadge>
          )}
        </div>
      )
    : scope
  const mobileMeta = statutMode
    ? [description, statut?.label].filter(Boolean).join(' · ') || undefined
    : scope

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
      subtitle={description}
      badges={badges}
      mobileMeta={mobileMeta}
      onClick={onClick}
      menuActions={menuActions}
    />
  )
}
