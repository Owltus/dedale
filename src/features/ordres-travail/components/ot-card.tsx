import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import { statutAffichageOt } from '@/features/ordres-travail/statut-affichage'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { ListRow } from '@/components/common/list-row'
import { StatutColonne } from '@/components/common/statut-colonne'
import { MiniatureThumb } from '@/features/miniatures/components/miniature-thumb'

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
 *
 * Les vignettes (`urlOf`/`refreshMiniatures`) sont INJECTÉES par le conteneur (qui
 * appelle `useMiniatureUrls` UNE fois pour toute la liste) → un seul canal Realtime
 * et une seule map d'URL, pas un par carte.
 */
export function OtCard({
  ot,
  urlOf,
  refreshMiniatures,
  menuActions,
  releve,
}: {
  ot: OtCardData
  urlOf: (id: string | null) => string | null
  refreshMiniatures: () => void
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
  // Statut d'affichage (métier ou temporel) — calculé UNE fois, partagé entre le
  // badge de la colonne et le `mobileMeta` (plus de double calcul via un sous-badge).
  const statut = statutAffichageOt({
    statut: ot.statut,
    origine: ot.origine,
    datePrevue: ot.date_prevue,
    toleranceJours: ot.tolerance_jours,
  })
  const datePrevue = formatDateAvecSemaineIso(ot.date_prevue)
  // Colonne de statut (badge + date prévue, largeur fixe centrée) — affichée à
  // l'identique au BUREAU (slot `badges`) ET sur MOBILE (slot `mobileBadge`) → badges
  // et dates centrés et alignés d'une carte à l'autre, à toutes les tailles.
  const statutColonne = <StatutColonne statut={statut} meta={datePrevue} />
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
      // Liséré de statut au bord gauche (code couleur lié au statut, comme les
      // Demandes d'intervention).
      tone={statut.tone}
      // À droite (bureau) : le relevé (s'il existe) À GAUCHE de la colonne statut/date.
      badges={
        <div className="flex items-center gap-4">
          {releve && (
            <span className="text-muted-foreground text-sm whitespace-nowrap">
              {releve}
            </span>
          )}
          {statutColonne}
        </div>
      }
      // Sous `sm` : la MÊME colonne de statut, réaffichée à droite (le sous-titre
      // équipement/description reste visible → pas besoin de `mobileMeta`).
      mobileBadge={statutColonne}
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
