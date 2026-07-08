import type { ReactNode } from 'react'
import { Ban, GitBranchPlus, Pencil, Trash2 } from 'lucide-react'
import type { ContratRow } from '../queries'
import {
  TYPE_CONTRAT,
  alerteContrat,
  progressionContrat,
  statutContrat,
  texteContrat,
} from '../etat'
import { formatDate } from '@/lib/date'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/common/status-badge'
import { ProgressBar } from '@/components/common/progress-bar'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'

interface InfoCol {
  label: string
  value: string
  /** Valeur en tonalité d'état défavorable (jamais `destructive`, réservé aux actions). */
  attention?: boolean
}

/** Colonnes de la ligne d'infos, adaptées au type de contrat (doc #15 §4.3). */
function infosContrat(c: ContratRow): InfoCol[] {
  const infos: InfoCol[] = [{ label: 'Début', value: formatDate(c.date_debut) }]
  if (c.type_contrat_id === TYPE_CONTRAT.determine) {
    infos.push({ label: 'Fin', value: formatDate(c.date_fin) })
  }
  if (c.date_signature) {
    infos.push({ label: 'Signature', value: formatDate(c.date_signature) })
  }
  if (c.type_contrat_id === TYPE_CONTRAT.tacite && c.duree_cycle_mois) {
    infos.push({ label: 'Cycle', value: `${String(c.duree_cycle_mois)} mois` })
  }
  if (c.type_contrat_id !== TYPE_CONTRAT.determine) {
    infos.push({
      label: 'Préavis',
      value: `${String(c.delai_preavis_jours)} j`,
    })
  }
  if (c.type_contrat_id === TYPE_CONTRAT.tacite && c.fenetre_resiliation_jours) {
    infos.push({
      label: 'Fenêtre résil.',
      value: `${String(c.fenetre_resiliation_jours)} j`,
    })
  }
  if (c.date_resiliation) {
    infos.push({
      label: 'Résilié le',
      value: formatDate(c.date_resiliation),
      attention: true,
    })
  }
  return infos
}

interface ContratCardProps {
  contrat: ContratRow
  canManage: boolean
  /** Nombre d'avenants (enfants directs) — badge de pied. */
  nbAvenants?: number
  onEdit?: () => void
  onAvenant?: () => void
  onResilier?: () => void
  onSupprimer?: () => void
  /** Zone additionnelle (documents, historique des versions) rendue en pied. */
  children?: ReactNode
}

/**
 * Carte riche d'un contrat (doc #15) : en-tête (type — référence + alerte + statut
 * détaillé), texte de contexte, barre de progression, ligne d'infos adaptative au
 * type, badge d'avenants et zone additionnelle. Toute la logique vient de `etat.ts`
 * (la carte ne fait qu'afficher). Un contrat archivé est grisé et en pointillés.
 */
export function ContratCard({
  contrat: c,
  canManage,
  nbAvenants = 0,
  onEdit,
  onAvenant,
  onResilier,
  onSupprimer,
  children,
}: ContratCardProps) {
  const statut = statutContrat(c)
  const alerte = alerteContrat(c)
  const progression = progressionContrat(c)
  const infos = infosContrat(c)

  const isArchive = statut.statut === 'archive'
  // Terminal : ni édition, ni avenant, ni résiliation (archivé, résilié, expiré).
  const isTerminal =
    isArchive || statut.statut === 'resilie' || statut.statut === 'expire'
  const dejaResilie = Boolean(c.date_resiliation)
  const typeLabel = c.types_contrats?.libelle ?? 'Contrat'

  return (
    <Card
      className={cn(
        'gap-3 py-4',
        isArchive && 'border-dashed opacity-60',
      )}
    >
      <CardContent className="space-y-3">
        {/* En-tête : titre + alerte à gauche, statut + actions à droite. */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">
              {typeLabel} — {c.reference}
            </h3>
            {alerte && <StatusBadge tone={alerte.tone}>{alerte.message}</StatusBadge>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex flex-col items-end gap-0.5">
              <StatusBadge tone={statut.tone}>{statut.label}</StatusBadge>
              {statut.sousStatut && (
                <span className="text-muted-foreground text-xs">
                  {statut.sousStatut}
                </span>
              )}
            </div>
            {canManage && (
              <div className="flex items-center">
                {!isTerminal && onEdit && (
                  <TooltipIconButton
                    icon={<Pencil />}
                    label="Modifier"
                    variant="ghost"
                    onClick={onEdit}
                  />
                )}
                {!isTerminal && onAvenant && (
                  <TooltipIconButton
                    icon={<GitBranchPlus />}
                    label="Créer un avenant"
                    variant="ghost"
                    onClick={onAvenant}
                  />
                )}
                {!isTerminal && !dejaResilie && onResilier && (
                  <TooltipIconButton
                    icon={<Ban className="text-destructive" />}
                    label="Résilier"
                    variant="ghost"
                    onClick={onResilier}
                  />
                )}
                {onSupprimer && (
                  <TooltipIconButton
                    icon={<Trash2 />}
                    label="Supprimer"
                    variant="ghost"
                    onClick={onSupprimer}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Objet d'avenant + commentaires. */}
        {c.objet_avenant && (
          <p className="text-sm">
            <span className="text-muted-foreground">Avenant : </span>
            {c.objet_avenant}
          </p>
        )}
        {c.commentaires && (
          <p className="text-muted-foreground line-clamp-2 text-sm italic">
            {c.commentaires}
          </p>
        )}

        {/* Texte de contexte + barre de progression. */}
        <p className="text-muted-foreground text-sm">{texteContrat(c)}</p>
        {progression != null && !isArchive && (
          <ProgressBar
            value={progression}
            tone={alerte?.tone ?? 'success'}
            label="Progression du contrat"
          />
        )}

        <Separator />

        {/* Ligne d'infos adaptative au type. */}
        <div className="flex flex-wrap gap-y-2 text-sm">
          {infos.map((i) => (
            <div key={i.label} className="min-w-20 flex-1 text-center">
              <div className="text-muted-foreground text-xs">{i.label}</div>
              <div className={cn(i.attention && 'text-warning')}>{i.value}</div>
            </div>
          ))}
        </div>

        {nbAvenants > 0 && (
          <>
            <Separator />
            <StatusBadge tone="neutral">
              {nbAvenants} avenant{nbAvenants > 1 ? 's' : ''}
            </StatusBadge>
          </>
        )}

        {children}
      </CardContent>
    </Card>
  )
}
