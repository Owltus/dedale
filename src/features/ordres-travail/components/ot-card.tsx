import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import type { RowAction } from '@/components/common/row-actions'
import {
  LIBELLES_STATUT_OT,
  variantStatutOt,
} from '@/features/ordres-travail/schemas'
import { formatDate } from '@/lib/date'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { Badge } from '@/components/ui/badge'

/**
 * Champs nécessaires au rendu d'une carte OT — communs aux requêtes `list`
 * (page Ordres de travail) et `byGammes` (panneau OT du Plan de maintenance).
 */
export interface OtCardData {
  id: string
  statut: string
  nom_gamme: string
  nom_equipement: string | null
  nom_prestataire: string | null
  date_prevue: string | null
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
}: {
  ot: OtCardData
  menuActions?: RowAction[]
}) {
  const navigate = useNavigate()
  return (
    <ListRow
      media={<RowMediaIcon icon={ClipboardList} />}
      title={ot.nom_gamme}
      subtitle={ot.nom_equipement ?? ot.nom_prestataire ?? undefined}
      badges={
        <Badge variant={variantStatutOt(ot.statut)}>
          {LIBELLES_STATUT_OT[ot.statut] ?? ot.statut}
        </Badge>
      }
      meta={formatDate(ot.date_prevue)}
      // Variante média : sous `sm`, `mobileMeta` REMPLACE le sous-titre → on y
      // condense l'info discriminante (équipement, statut, date prévue).
      mobileMeta={[
        ot.nom_equipement ?? ot.nom_prestataire,
        LIBELLES_STATUT_OT[ot.statut] ?? ot.statut,
        formatDate(ot.date_prevue),
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
