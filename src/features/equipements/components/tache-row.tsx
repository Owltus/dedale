import { useQuery } from '@tanstack/react-query'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Pencil, Trash2 } from 'lucide-react'
import {
  LIBELLES_STATUT_ZONE,
  STATUTS_ZONE,
  toneStatutZone,
  type StatutZone,
} from '@/features/equipements/statut-zone'
import { documentsQueries } from '@/features/documents/queries'
import type { LiaisonTable } from '@/features/documents/queries'
import { DocumentsListe } from '@/components/common/documents-liste'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { SelectDropdown } from '@/components/ui/select-dropdown'
import { DateField } from '@/components/ui/date-field'
import { StatusBadge } from '@/components/common/status-badge'
import { formatDateAvecSemaineIso } from '@/lib/date'
import { cn } from '@/lib/utils'

export interface TacheItem {
  id: string
  libelle: string
  statut: string
  ordre: number
  local_id: string | null
  equipement_id: string | null
  commentaire: string | null
  date_tache: string | null
  created_at: string
  locaux: { id: string; nom: string } | null
  equipements: { id: string; nom: string } | null
}

interface TacheRowProps {
  tache: TacheItem
  /** Statut figé (fiche parente non modifiable) ou rôle sans écriture. */
  readOnly: boolean
  onEdit: () => void
  onDelete: () => void
  onChangeStatut: (next: StatutZone) => void
  statutPending: boolean
  /** Date de la tâche (093), éditable EN LIGNE comme le statut. */
  onChangeDate: (next: string) => void
  datePending: boolean
  /** Active la poignée de glisser-déposer (réordonnancement, étape 5). */
  sortable?: boolean
  /**
   * Coordonnées de la table de liaison documents de la FICHE parente —
   * permet d'afficher les documents rattachés à CETTE tâche (091, étape 6) :
   * compte dans le libellé, mini-liste sous la ligne (aperçu + glisser hors
   * de la tâche), et zone de dépôt pour en rattacher un nouveau.
   */
  documents: {
    liaison: LiaisonTable
    parentColumn: string
    parentId: string
  }
}

/**
 * Ligne COMPACTE d'une tâche généralisée (090) : libellé (identité) + statut
 * d'avancement éditable EN LIGNE (sauvegarde immédiate à la sélection), + les
 * documents rattachés (091) affichés en mini-liste repliable sous la ligne.
 * Le lieu, l'équipement et le commentaire ne s'affichent plus dans la ligne —
 * ils se consultent/modifient dans `TacheDialog`, au clic. Brique commune
 * Travaux/Événements : la feature appelante fournit `onChangeStatut` (et son
 * propre état `pending`), la ligne ne connaît aucune mutation d'écriture sur
 * la tâche elle-même (seule la lecture des documents est portée ici).
 */
export function TacheRow({
  tache,
  readOnly,
  onEdit,
  onDelete,
  onChangeStatut,
  statutPending,
  onChangeDate,
  datePending,
  sortable = false,
  documents,
}: TacheRowProps) {
  const statut = tache.statut as StatutZone
  const docsQuery = useQuery(
    documentsQueries.byEntity(
      documents.liaison,
      documents.parentColumn,
      documents.parentId,
      tache.id,
    ),
  )
  const docs = docsQuery.data ?? []

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: tache.id,
    data: { type: 'tache', tacheId: tache.id },
    disabled: { draggable: !sortable, droppable: readOnly },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={cn(
        'group rounded-md border bg-card',
        isOver && 'ring-2 ring-primary',
      )}
    >
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        {sortable && (
          <button
            type="button"
            aria-label={`Réordonner — ${tache.libelle}`}
            className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}

        {/* Libellé SEUL sur la ligne — plus de compteur de pièces jointes
            (la mini-liste juste en dessous suffit à le montrer). */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{tache.libelle}</p>
        </div>

        {/* Bloc droit, dans l'ordre demandé : actions (Modifier/Supprimer,
            au survol) d'abord, puis date, puis statut. */}
        {!readOnly && (
          <div
            className={cn(
              'flex shrink-0 items-center opacity-0 transition-opacity',
              'group-focus-within:opacity-100 group-hover:opacity-100',
              '[@media(hover:none)]:opacity-100',
            )}
          >
            <TooltipIconButton
              icon={<Pencil />}
              label="Modifier cette tâche"
              onClick={onEdit}
            />
            <TooltipIconButton
              icon={<Trash2 className="text-destructive" />}
              label="Retirer cette tâche"
              onClick={onDelete}
            />
          </div>
        )}

        {readOnly ? (
          <>
            {tache.date_tache && (
              <p className="shrink-0 text-xs text-muted-foreground">
                {formatDateAvecSemaineIso(tache.date_tache)}
              </p>
            )}
            <StatusBadge tone={toneStatutZone(statut)} className="shrink-0">
              {LIBELLES_STATUT_ZONE[statut]}
            </StatusBadge>
          </>
        ) : (
          <>
            <DateField
              ariaLabel={`Date — ${tache.libelle}`}
              value={tache.date_tache ?? ''}
              onValueChange={onChangeDate}
              disabled={datePending}
              className="h-9 w-36 shrink-0"
            />
            <SelectDropdown
              ariaLabel={`Statut — ${tache.libelle}`}
              value={statut}
              disabled={statutPending}
              onValueChange={(v) => onChangeStatut(v as StatutZone)}
              options={STATUTS_ZONE.map((s) => ({
                value: s,
                label: LIBELLES_STATUT_ZONE[s],
              }))}
              className="h-9 w-36 shrink-0 px-2"
              checkIndicator={false}
            />
          </>
        )}
      </div>

      {docs.length > 0 && (
        <div className="border-t px-3 py-2">
          <DocumentsListe
            docs={docs}
            draggable={!readOnly}
            compact
            className="flex flex-col gap-1"
          />
        </div>
      )}
    </div>
  )
}
