import type { ReactNode } from 'react'
import { formatTaille } from '../format'
import type { DocumentMeta } from '../format'
import { formatDate } from '@/lib/date'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { iconeFormat } from '@/components/common/file-format-icons'

interface DocumentRowProps {
  doc: DocumentMeta
  /** Clic sur la ligne (typiquement : ouvrir l'aperçu). */
  onClick?: () => void
  /** Badges à droite (ex. type métier) — masqués sous `sm`, cf. `mobileMeta`. */
  badges?: ReactNode
  /** Repli mobile de l'info clé (sous le titre, sous `sm`). */
  mobileMeta?: ReactNode
  /** Actions au survol (boutons icône : télécharger, détacher, supprimer…). */
  actions?: ReactNode
}

/**
 * Carte de document RÉUTILISABLE : une `ListRow` (variante média, densité `sm`)
 * avec l'icône selon le format (`iconeFormat`), le nom et « taille · date ».
 * Présentation UNIQUE partagée par la bibliothèque (page Documents) et les fiches
 * (`DocumentsTab`) → rendu identique partout. Les actions/badges varient (contenu).
 */
export function DocumentRow({
  doc,
  onClick,
  badges,
  mobileMeta,
  actions,
}: DocumentRowProps) {
  return (
    <ListRow
      size="sm"
      media={<RowMediaIcon icon={iconeFormat(doc.mime_type)} />}
      title={doc.nom_original}
      subtitle={`${formatTaille(doc.taille_octets)} · ${formatDate(doc.uploaded_at)}`}
      onClick={onClick}
      badges={badges}
      mobileMeta={mobileMeta}
      actions={actions}
    />
  )
}
