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
  statut: string
  ordre: number
  local_id: string
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
 * Ligne d'une ZONE concernée : le local (intitulé principal) + l'équipement
 * précis éventuel, et le statut d'avancement éditable EN LIGNE (sauvegarde
 * immédiate à la sélection). En lecture seule, le statut s'affiche en badge.
 */
export function TacheRow({ tache, travauxId, readOnly, onDelete }: TacheRowProps) {
  const update = useUpdateTacheStatut()
  const statut = tache.statut as StatutTache
  const localNom = tache.locaux?.nom ?? 'Local supprimé'

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
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <MapPin className="text-muted-foreground size-3.5 shrink-0" />
          <span className="truncate">{localNom}</span>
        </p>
        {tache.equipements && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Wrench className="size-3 shrink-0" />
            <span className="truncate">{tache.equipements.nom}</span>
          </p>
        )}
      </div>

      {readOnly ? (
        <Badge variant={variantStatutTache(statut)} className="shrink-0">
          {LIBELLES_STATUT_TACHE[statut]}
        </Badge>
      ) : (
        <Select
          aria-label={`Statut — ${localNom}`}
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
          label="Retirer cette zone"
          onClick={onDelete}
        />
      )}
    </div>
  )
}
