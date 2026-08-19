import { MapPin, Pencil, Trash2, Wrench } from 'lucide-react'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'

export interface LieuItem {
  id: string
  ordre: number
  local_id: string
  equipement_id: string | null
  created_at: string
  locaux: { id: string; nom: string } | null
  equipements: { id: string; nom: string } | null
}

interface LieuRowProps {
  lieu: LieuItem
  readOnly: boolean
  onEdit: () => void
  onDelete: () => void
}

/**
 * Ligne d'un LIEU concerné par un événement : le local (intitulé principal) +
 * l'équipement précis éventuel. Miroir de `TacheRow`, SANS le statut
 * d'avancement — un lieu d'événement n'est pas une tâche à réaliser, juste un
 * endroit constaté.
 */
export function LieuRow({ lieu, readOnly, onEdit, onDelete }: LieuRowProps) {
  const localNom = lieu.locaux?.nom ?? 'Local supprimé'

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{localNom}</span>
        </p>
        {lieu.equipements && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wrench className="size-3 shrink-0" />
            <span className="truncate">{lieu.equipements.nom}</span>
          </p>
        )}
      </div>

      {!readOnly && (
        <>
          <TooltipIconButton
            icon={<Pencil />}
            label="Modifier ce lieu"
            onClick={onEdit}
          />
          <TooltipIconButton
            icon={<Trash2 className="text-destructive" />}
            label="Retirer ce lieu"
            onClick={onDelete}
          />
        </>
      )}
    </div>
  )
}
