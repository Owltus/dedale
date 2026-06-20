import { MapPin, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import {
  LIBELLES_STATUT_TACHE,
  STATUTS_TACHE,
  variantStatutTache,
  type StatutTache,
} from '../schemas'
import { useUpdateTacheStatut } from '../mutations'
import { errorMessage } from '@/lib/form'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

export interface TacheItem {
  id: string
  libelle: string
  statut: string
  ordre: number
  local_id: string | null
  equipement_id: string | null
  created_at: string
  locaux: { id: string; nom: string } | null
  equipements: { id: string; nom: string } | null
}

interface TacheRowProps {
  tache: TacheItem
  travauxId: string
  /** Statut figé (travail Terminé/Annulé) ou rôle sans écriture. */
  readOnly: boolean
  onDelete: () => void
}

/**
 * Ligne d'une tâche (to-do) : libellé + local/équipement concernés, statut
 * éditable EN LIGNE (sauvegarde immédiate à la sélection), et suppression. En
 * lecture seule, le statut s'affiche en badge. Esprit des opérations d'un OT.
 */
export function TacheRow({ tache, travauxId, readOnly, onDelete }: TacheRowProps) {
  const update = useUpdateTacheStatut()
  const statut = tache.statut as StatutTache

  function changeStatut(next: StatutTache) {
    if (next === statut) return
    update.mutate(
      { id: tache.id, travauxId, statut: next },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <div className="bg-card flex items-center gap-3 rounded-md border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tache.libelle}</p>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
          {tache.locaux && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{tache.locaux.nom}</span>
            </span>
          )}
          {tache.equipements && (
            <span className="flex items-center gap-1">
              <Wrench className="size-3 shrink-0" />
              <span className="truncate">{tache.equipements.nom}</span>
            </span>
          )}
          {!tache.locaux && !tache.equipements && <span>Sans rattachement</span>}
        </div>
      </div>

      {readOnly ? (
        <Badge variant={variantStatutTache(statut)} className="shrink-0">
          {LIBELLES_STATUT_TACHE[statut]}
        </Badge>
      ) : (
        <Select
          aria-label={`Statut de « ${tache.libelle} »`}
          value={statut}
          disabled={update.isPending}
          onChange={(e) => changeStatut(e.target.value as StatutTache)}
          className="w-auto shrink-0"
        >
          {STATUTS_TACHE.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_STATUT_TACHE[s]}
            </option>
          ))}
        </Select>
      )}

      {!readOnly && (
        <TooltipIconButton
          icon={<Trash2 className="text-destructive" />}
          label="Supprimer la tâche"
          onClick={onDelete}
        />
      )}
    </div>
  )
}
