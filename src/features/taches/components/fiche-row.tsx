import type { LucideIcon } from 'lucide-react'
import { DocumentIndicator } from '@/features/documents/components/document-indicator'
import type { DocumentMeta } from '@/features/documents/format'
import { formatDate } from '@/lib/date'
import { ListRow } from '@/components/common/list-row'
import { RowMediaIcon } from '@/components/common/row-media-icon'
import { StatusBadge, type StatusTone } from '@/components/common/status-badge'
import type { RowAction } from '@/components/common/row-actions'

/** Lieu principal joint à une fiche (098) : le local et/ou l'équipement. */
export interface LieuPrincipal {
  locaux: { id: string; nom: string } | null
  equipements: { id: string; categories: { nom: string } | null } | null
}

/** « Chambre 214 · Climatiseur » : lieu principal d'une fiche, vide si aucun. */
export function lieuPrincipalTexte(f: LieuPrincipal): string {
  return [
    f.locaux?.nom,
    f.equipements && (f.equipements.categories?.nom ?? 'Équipement'),
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * Ligne d'une FICHE À TÂCHES (Travaux, Événement) : icône, titre, lieu
 * principal + description en sous-titre, et à droite l'icône documents COLLÉE
 * à la colonne statut / date. Source unique du rendu : pages Travaux et
 * Événements, onglets de la fiche d'un lieu.
 *
 * L'icône documents vit dans le MÊME slot `meta` que le statut (deux slots
 * séparés les écartaient de deux `gap`) ; `meta` n'étant pas relevé au-dessus
 * de l'overlay de clic de `ListRow`, elle porte son propre `relative z-10` —
 * sans lui, le clic ouvrait la fiche au lieu du document. Pas de largeur fixe
 * sur la colonne statut : un statut court laissait un vide entre les deux.
 */
export function FicheRow({
  icon,
  tone,
  titre,
  sousTitre,
  statutLabel,
  date,
  documents,
  onClick,
  menuActions,
}: {
  icon: LucideIcon
  tone: StatusTone
  titre: string
  sousTitre: string
  statutLabel: string
  /** Date qui SUIT le statut affiché (terminé → date de fin). ISO. */
  date: string
  documents: DocumentMeta[]
  onClick: () => void
  menuActions?: RowAction[]
}) {
  const indicateur =
    documents.length > 0 ? (
      <DocumentIndicator documents={documents} entiteNom={titre} size="sm" />
    ) : undefined
  return (
    <ListRow
      tone={tone}
      media={<RowMediaIcon icon={icon} />}
      title={titre}
      subtitle={sousTitre}
      onClick={onClick}
      mobileBadge={indicateur}
      meta={
        <div className="flex items-center gap-2">
          {indicateur && <div className="relative z-10">{indicateur}</div>}
          <div className="flex flex-col items-end gap-1">
            <StatusBadge tone={tone}>{statutLabel}</StatusBadge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDate(date)}
            </span>
          </div>
        </div>
      }
      mobileMeta={`${statutLabel} · ${formatDate(date)}`}
      menuActions={menuActions}
    />
  )
}
