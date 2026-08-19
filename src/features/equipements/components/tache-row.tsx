import { useQuery } from '@tanstack/react-query'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Paperclip, Pencil, Trash2 } from 'lucide-react'
import {
  LIBELLES_STATUT_ZONE,
  STATUTS_ZONE,
  variantStatutZone,
  type StatutZone,
} from '@/features/equipements/statut-zone'
import { documentsQueries } from '@/features/documents/queries'
import type { LiaisonTable } from '@/features/documents/queries'
import { DocumentsListe } from '@/components/common/documents-liste'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { SelectDropdown } from '@/components/ui/select-dropdown'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export interface TacheItem {
  id: string
  libelle: string
  statut: string
  ordre: number
  local_id: string | null
  equipement_id: string | null
  commentaire: string | null
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
        'rounded-md border bg-card',
        isOver && 'ring-2 ring-primary',
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2">
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

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            <span className="truncate">{tache.libelle}</span>
            {docs.length > 0 && (
              <span className="flex shrink-0 items-center gap-0.5 text-xs font-normal text-muted-foreground">
                <Paperclip className="size-3" />
                {docs.length}
              </span>
            )}
          </p>
        </div>

        {readOnly ? (
          <Badge variant={variantStatutZone(statut)} className="shrink-0">
            {LIBELLES_STATUT_ZONE[statut]}
          </Badge>
        ) : (
          <SelectDropdown
            ariaLabel={`Statut — ${tache.libelle}`}
            value={statut}
            disabled={statutPending}
            onValueChange={(v) => onChangeStatut(v as StatutZone)}
            options={STATUTS_ZONE.map((s) => ({
              value: s,
              label: LIBELLES_STATUT_ZONE[s],
            }))}
            className="w-auto shrink-0"
            checkIndicator={false}
          />
        )}

        {!readOnly && (
          <>
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
          </>
        )}
      </div>

      {docs.length > 0 && (
        <div className="border-t px-3 py-2">
          <DocumentsListe
            docs={docs}
            draggable={!readOnly}
            className="flex flex-col gap-1"
          />
        </div>
      )}
    </div>
  )
}
