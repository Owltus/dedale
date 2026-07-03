import type { RowAction } from '@/components/common/row-actions'
import { type StatusTone } from '@/components/common/status-badge'
import { CategorieCard, type CategorieCardData } from './categorie-card'

/**
 * Carte (ListRow média) d'une SOUS-CATÉGORIE de gammes. Rendu STRICTEMENT
 * identique à `CategorieCard` (variante non virtuelle) : simple façade nommée qui
 * remappe `sousCategorie` → `categorie` et délègue tout le rendu. Conservée comme
 * point d'appel distinct (sémantique « sous-catégorie » à l'usage) pour pouvoir
 * évoluer indépendamment si besoin.
 *
 * Deux variantes (héritées de `CategorieCard`) :
 *  - `statut` (ou `statutPending`) FOURNI → mode « Plan de maintenance » : badge de
 *    statut temporel à droite (synthèse du pire cas des gammes, calculée par le
 *    conteneur), badges de périmètre masqués ;
 *  - SINON → mode « Bibliothèque » : badges de périmètre selon `showScopeBadges`.
 */
export function SousCategorieCard({
  sousCategorie,
  ...rest
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
  return <CategorieCard categorie={sousCategorie} {...rest} />
}
