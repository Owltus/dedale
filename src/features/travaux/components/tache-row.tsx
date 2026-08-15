import { MapPin, Pencil, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import {
  LIBELLES_STATUT_TACHE,
  STATUTS_TACHE,
  variantStatutTache,
  type StatutTache,
} from '../schemas'
import { useUpdateTacheStatut } from '../mutations'
import { writeErrorMessage } from '@/lib/form'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { SelectDropdown } from '@/components/ui/select-dropdown'
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
  onEdit: () => void
  onDelete: () => void
}

/**
 * Ligne d'une ZONE concernée : le local (intitulé principal) + l'équipement
 * précis éventuel, et le statut d'avancement éditable EN LIGNE (sauvegarde
 * immédiate à la sélection). En lecture seule, le statut s'affiche en badge.
 */
export function TacheRow({
  tache,
  travauxId,
  readOnly,
  onEdit,
  onDelete,
}: TacheRowProps) {
  const update = useUpdateTacheStatut()
  const statut = tache.statut as StatutTache
  const localNom = tache.locaux?.nom ?? 'Local supprimé'

  function changeStatut(next: StatutTache) {
    if (next === statut) return
    update.mutate(
      { id: tache.id, travauxId, statut: next },
      {
        onSuccess: () => toast.success('Statut mis à jour'),
        onError: (e) => toast.error(writeErrorMessage(e)),
      },
    )
  }

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{localNom}</span>
        </p>
        {tache.equipements && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
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
        <SelectDropdown
          ariaLabel={`Statut — ${localNom}`}
          value={statut}
          disabled={update.isPending}
          onValueChange={(v) => {
            changeStatut(v as StatutTache)
          }}
          options={STATUTS_TACHE.map((s) => ({
            value: s,
            label: LIBELLES_STATUT_TACHE[s],
          }))}
          className="w-auto shrink-0"
          checkIndicator={false}
        />
      )}

      {!readOnly && (
        <>
          <TooltipIconButton
            icon={<Pencil />}
            label="Modifier cette zone"
            onClick={onEdit}
          />
          <TooltipIconButton
            icon={<Trash2 className="text-destructive" />}
            label="Retirer cette zone"
            onClick={onDelete}
          />
        </>
      )}
    </div>
  )
}
