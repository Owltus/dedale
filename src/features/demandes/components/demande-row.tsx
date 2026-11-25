import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import { diTitre } from '../schemas'
import {
  LIEU_NON_PRECISE,
  STATUT_DI_CLOTURE,
  statutLabel,
  statutTone,
} from '../etat'
import { TitreLieu } from './titre-lieu'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { segAlias } from '@/lib/slug'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { StatutColonne } from '@/components/common/statut-colonne'
import type { RowAction } from '@/components/common/row-actions'

/** Champs d'une DI nécessaires à sa ligne. */
export interface DemandeRowData {
  id: string
  constat: string
  statut_di_id: number
  date_constat: string
  date_resolution: string | null
}

/**
 * Ligne d'une demande d'intervention : le lieu en titre, le constat dessous,
 * statut + date à droite (comme `OtCard`). Clic → fiche de la DI par un lien
 * `slug~id`, qui s'ouvre sans relire la liste. Source unique du rendu d'une DI
 * en liste : page Demandes et onglet DI de la fiche d'un lieu.
 */
export function DemandeRow({
  demande: d,
  lieu,
  menuActions,
}: {
  demande: DemandeRowData
  /** Lieu(x) de la demande en texte, `null` si aucun. */
  lieu: string | null
  menuActions?: RowAction[]
}) {
  const navigate = useNavigate()
  // Clôturée → date de clôture ; Ouverte ou En cours → date d'ouverture (le
  // constat). Semaine ISO comme partout.
  const dateStatut =
    d.statut_di_id === STATUT_DI_CLOTURE && d.date_resolution
      ? d.date_resolution
      : d.date_constat
  const statutColonne = (
    <StatutColonne
      statut={{
        label: statutLabel(d.statut_di_id),
        tone: statutTone(d.statut_di_id),
      }}
      meta={formatDateAvecSemaineIso(dateStatut)}
    />
  )
  return (
    <ListRow
      tone={statutTone(d.statut_di_id)}
      media={<RowMediaIcon icon={ClipboardList} />}
      // Ligne 1 : le lieu ; ligne 2 : le constat (ni auteur ni origine, choix PO).
      title={<TitreLieu lieu={lieu} chargement={false} />}
      titleLabel={`${lieu ?? LIEU_NON_PRECISE} — ${diTitre(d.constat)}`}
      subtitle={diTitre(d.constat)}
      onClick={() =>
        void navigate({
          to: '/demandes/$demande',
          params: {
            demande: segAlias({ nom: diTitre(d.constat), id: d.id }),
          },
        })
      }
      badges={statutColonne}
      mobileBadge={statutColonne}
      menuActions={menuActions}
    />
  )
}
