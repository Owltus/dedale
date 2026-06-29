import { Folder, Inbox } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { ListRow } from '@/components/common/list-row'
import { ScopeBadges } from '@/components/common/scope-badges'
import { type StatusTone } from '@/components/common/status-badge'
import { StatutColonne } from '@/components/common/statut-colonne'
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
 * description + (option) badge de STATUT agrégé OU badges de périmètre. Source
 * UNIQUE du rendu d'une catégorie → liste de l'explorateur du Plan de maintenance
 * ET de la Bibliothèque. Le bac virtuel « Non classé » est rendu via `virtual`
 * (icône Inbox).
 *
 * Deux variantes :
 *  - `statut` (ou `statutPending`) FOURNI → mode « Plan de maintenance » : badge de
 *    statut temporel à droite (synthèse du pire cas de TOUTES les gammes de la
 *    catégorie, calculée par le conteneur), badges de périmètre masqués ;
 *  - SINON → mode « Bibliothèque » : badges de périmètre selon `showScopeBadges`.
 */
export function CategorieCard({
  categorie,
  urlOf,
  refreshMiniatures,
  onClick,
  menuActions,
  showScopeBadges = false,
  virtual = false,
  statut,
  statutPending = false,
}: {
  categorie: CategorieCardData
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
   * Bac virtuel « Non classé » (catégorie hors base regroupant les gammes sans
   * catégorie visible) : icône Inbox, sans vignette ni badge de périmètre.
   */
  virtual?: boolean
  /**
   * Statut temporel agrégé (libellé + tonalité), calculé par le conteneur via
   * `statutAffichageAgrege` sur toutes les gammes de la catégorie. Sa présence — ou
   * `statutPending` — bascule la carte en mode « statut » (badge à droite, périmètre
   * masqué).
   */
  statut?: { label: string; tone: StatusTone }
  /**
   * Chargement des OT en cours : on garde le mode statut (mise en page stable) mais
   * on masque le badge le temps du fetch (pas d'état trompeur avant les données).
   */
  statutPending?: boolean
}) {
  const statutMode = statut !== undefined || statutPending
  const description = categorie.description?.trim()
    ? categorie.description.trim()
    : undefined
  const scope =
    showScopeBadges && !virtual ? (
      <ScopeBadges siteId={categorie.site_id} />
    ) : undefined

  // Mode statut : colonne `StatutColonne` (badge centré, même gabarit aligné que la
  // carte OT), affichée au BUREAU (`badges`) ET sur MOBILE (`mobileBadge`) → badges
  // centrés et alignés d'une carte à l'autre à toutes les tailles. Sinon : badges de
  // périmètre (repliés en texte sur mobile via `mobileMeta`).
  const statutColonne = <StatutColonne statut={statut} />
  const badges = statutMode ? statutColonne : scope
  const mobileBadge = statutMode ? statutColonne : undefined
  const mobileMeta = statutMode ? undefined : scope

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
      subtitle={description}
      // Liséré de statut au bord gauche (code couleur lié au statut, comme les
      // Demandes) — uniquement en mode statut.
      tone={statut?.tone}
      badges={badges}
      mobileBadge={mobileBadge}
      mobileMeta={mobileMeta}
      onClick={onClick}
      menuActions={menuActions}
    />
  )
}
