import { Wrench } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { ListRow } from '@/components/common/list-row'
import { StatutColonne } from '@/components/common/statut-colonne'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { Badge } from '@/components/ui/badge'
import type { OtTriable } from '@/features/ordres-travail/tri'
import { NATURE_GAMME_LABEL } from '../schemas'
import { statutAffichageGamme } from '../statut-affichage'
import type { GammeRow } from './gamme-detail'

/**
 * Carte (ListRow média) d'une gamme : vignette + nom + sous-titre + nature +
 * prestataire. Source UNIQUE du rendu d'une gamme en LISTE → utilisée dans
 * l'explorateur du Plan de maintenance (gammes de site, avec badge de statut) ET
 * dans la Bibliothèque (templates communs, sans statut). Visuel identique partout.
 *
 * Deux variantes selon `statutOts` :
 *  - FOURNI (Plan de maintenance) : badge de STATUT à droite (façon carte OT,
 *    synthèse priorisée des OT de la gamme), nature + prestataire ramenés près du
 *    nom (sous-titre) ;
 *  - ABSENT (Bibliothèque / fiche) : rendu classique (badge nature à droite,
 *    prestataire en méta) — les gammes-templates communes n'ont pas d'OT.
 */
export function GammeCard({
  gamme,
  urlOf,
  refreshMiniatures,
  onClick,
  menuActions,
  showPrestataire = true,
  statutOts,
  statutPending = false,
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
  /**
   * OT de la gamme (sous-ensemble triable). Sa présence (même tableau vide)
   * BASCULE la carte en variante « Plan de maintenance » avec badge de statut.
   * Absent → variante Bibliothèque, sans badge.
   */
  statutOts?: OtTriable[]
  /**
   * Chargement des OT en cours : on garde la variante statut (mise en page stable)
   * mais on masque le badge le temps du fetch, pour ne pas afficher un « Non
   * assigné » trompeur avant l'arrivée des données.
   */
  statutPending?: boolean
}) {
  const media = (
    <MiniatureThumb
      url={urlOf(gamme.miniature_id)}
      fallback={<Wrench className="size-10" />}
      alt=""
      onError={refreshMiniatures}
      className="size-full rounded-none"
    />
  )

  const natureBadge = (
    <Badge
      variant={
        gamme.nature === 'controle_reglementaire' ? 'default' : 'secondary'
      }
    >
      {NATURE_GAMME_LABEL[gamme.nature]}
    </Badge>
  )

  // Variante PLAN DE MAINTENANCE : statut à droite (façon carte OT), nature +
  // prestataire ramenés près du nom.
  if (statutOts !== undefined) {
    const statut = statutAffichageGamme({
      estActive: gamme.est_active,
      ots: statutOts,
    })
    return (
      <ListRow
        media={media}
        title={gamme.nom}
        subtitle={
          gamme.description?.trim() ? gamme.description.trim() : undefined
        }
        // Colonne de droite (brique `StatutColonne`) — MÊME gabarit que la carte
        // OT : badge de statut EN HAUT, périodicité EN DESSOUS (là où l'OT met la
        // date prévue). Statut masqué tant que les OT chargent (pas de « Non
        // assigné » trompeur) ; la périodicité, connue d'emblée, reste affichée.
        badges={
          <StatutColonne
            statut={statutPending ? undefined : statut}
            meta={gamme.periodicites?.libelle ?? '—'}
          />
        }
        mobileMeta={[
          gamme.description?.trim(),
          statutPending ? null : statut.label,
          gamme.periodicites?.libelle,
        ]
          .filter(Boolean)
          .join(' · ')}
        onClick={onClick}
        menuActions={menuActions}
      />
    )
  }

  // Variante BIBLIOTHÈQUE / fiche : rendu classique (nature à droite).
  return (
    <ListRow
      media={media}
      title={gamme.nom}
      subtitle={
        gamme.description?.trim()
          ? gamme.description.trim()
          : (gamme.periodicites?.libelle ?? undefined)
      }
      badges={natureBadge}
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
