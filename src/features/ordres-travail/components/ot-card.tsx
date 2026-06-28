import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { statutAffichageOt } from '@/features/ordres-travail/statut-affichage'
import { OtStatutBadge } from '@/features/ordres-travail/components/ot-statut-badge'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { ListRow } from '@/components/common/list-row'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'
import { useMiniatureUrls } from '@/features/miniatures/use-miniature-urls'

/**
 * Champs nécessaires au rendu d'une carte OT — communs aux requêtes `list`
 * (page Ordres de travail) et `byGammes` (panneau OT du Plan de maintenance).
 */
export interface OtCardData {
  id: string
  statut: string
  /** Origine (enum ot_origine) — distingue Planifié (plan) / Programmé (ponctuel). */
  origine: string
  nom_gamme: string
  nom_equipement: string | null
  /** Description (snapshot de la gamme) — sous-titre de repli quand l'OT n'a pas d'équipement. */
  description_gamme: string | null
  date_prevue: string | null
  /** Fenêtre de tolérance (jours) : pilote la bascule vers les statuts temporels. */
  tolerance_jours: number
  /** Vignette esthétique de l'OT (héritée de la gamme — migration 067). */
  miniature_id: string | null
}

/**
 * Carte (ListRow) d'un ordre de travail : icône + gamme + équipement/prestataire +
 * badge de statut + date prévue. Source UNIQUE du rendu d'un OT → partagée par la
 * page liste « Ordres de travail » ET par `OtListeParGammes` (Plan de maintenance,
 * onglet OT d'une fiche gamme). Le clic ouvre le détail (`/ordres-travail/<id>`).
 * La page fournit les `menuActions` autorisées (ex. Supprimer pour un gestionnaire).
 */
export function OtCard({
  ot,
  menuActions,
  releve,
}: {
  ot: OtCardData
  menuActions?: RowAction[]
  /**
   * Relevé (somme de consommation, ex. « 80 kWh ») calculé en amont par
   * `calculerRelevesParOt`. Affiché À GAUCHE de la colonne statut/date, masqué si
   * vide. Injecté par CHAQUE conteneur d'OT (page liste, panneau par-gamme, popup
   * planning) → même valeur partout.
   */
  releve?: string | null
}) {
  const navigate = useNavigate()
  const { urlOf, refresh: refreshMiniatures } = useMiniatureUrls()
  // Libellé d'affichage (statut métier ou temporel) — réutilisé pour `mobileMeta`.
  const statutLabel = statutAffichageOt({
    statut: ot.statut,
    origine: ot.origine,
    datePrevue: ot.date_prevue,
    toleranceJours: ot.tolerance_jours,
  }).label
  return (
    <ListRow
      media={
        <MiniatureThumb
          url={urlOf(ot.miniature_id)}
          fallback={<ClipboardList className="size-10" />}
          alt=""
          onError={refreshMiniatures}
          className="size-full rounded-none"
        />
      }
      title={ot.nom_gamme}
      subtitle={ot.nom_equipement ?? ot.description_gamme ?? undefined}
      // À droite : le relevé (s'il existe) À GAUCHE de la colonne statut/date.
      // Statut + date prévue empilés en COLONNE (statut en haut, date dessous),
      // largeur FIXE + contenu centré : les libellés de statut ont des largeurs
      // variables, mais la colonne occupe la même place sur toutes les cartes →
      // badges et dates alignés verticalement d'une ligne à l'autre.
      badges={
        <div className="flex items-center gap-4">
          {releve && (
            <span className="text-muted-foreground text-sm whitespace-nowrap">
              {releve}
            </span>
          )}
          <div className="flex w-36 flex-col items-center gap-1 text-center">
            <OtStatutBadge
              statut={ot.statut}
              origine={ot.origine}
              datePrevue={ot.date_prevue}
              toleranceJours={ot.tolerance_jours}
            />
            <span className="text-muted-foreground text-sm">
              {formatDateAvecSemaineIso(ot.date_prevue)}
            </span>
          </div>
        </div>
      }
      // Variante média : sous `sm`, `mobileMeta` REMPLACE le sous-titre → on y
      // condense l'info discriminante (équipement, statut, date prévue).
      mobileMeta={[
        ot.nom_equipement ?? ot.description_gamme,
        statutLabel,
        formatDateAvecSemaineIso(ot.date_prevue),
      ]
        .filter(Boolean)
        .join(' · ')}
      onClick={() =>
        void navigate({
          to: '/ordres-travail/$otId',
          params: { otId: ot.id },
        })
      }
      menuActions={menuActions}
    />
  )
}
