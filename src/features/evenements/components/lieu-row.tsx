import { MapPin, Pencil, Trash2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import {
  LIBELLES_STATUT_ZONE,
  STATUTS_ZONE,
  variantStatutZone,
  type StatutZone,
} from '@/features/equipements/statut-zone'
import { useUpdateLieuStatut } from '../mutations'
import { writeErrorMessage } from '@/lib/form'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { SelectDropdown } from '@/components/ui/select-dropdown'
import { Badge } from '@/components/ui/badge'

export interface LieuItem {
  id: string
  statut: string
  ordre: number
  local_id: string
  equipement_id: string | null
  created_at: string
  locaux: { id: string; nom: string } | null
  equipements: { id: string; nom: string } | null
}

interface LieuRowProps {
  lieu: LieuItem
  evenementId: string
  readOnly: boolean
  onEdit: () => void
  onDelete: () => void
}

/**
 * Ligne d'un LIEU concerné par un événement : le local (intitulé principal) +
 * l'équipement précis éventuel, et le statut d'avancement éditable EN LIGNE
 * (sauvegarde immédiate à la sélection). Miroir exact de `TacheRow` (088,
 * décision PO — Travaux et Événements suivent leurs zones de la même façon).
 */
export function LieuRow({
  lieu,
  evenementId,
  readOnly,
  onEdit,
  onDelete,
}: LieuRowProps) {
  const update = useUpdateLieuStatut()
  const statut = lieu.statut as StatutZone
  const localNom = lieu.locaux?.nom ?? 'Local supprimé'

  function changeStatut(next: StatutZone) {
    if (next === statut) return
    update.mutate(
      { id: lieu.id, evenementId, statut: next },
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
        {lieu.equipements && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wrench className="size-3 shrink-0" />
            <span className="truncate">{lieu.equipements.nom}</span>
          </p>
        )}
      </div>

      {readOnly ? (
        <Badge variant={variantStatutZone(statut)} className="shrink-0">
          {LIBELLES_STATUT_ZONE[statut]}
        </Badge>
      ) : (
        <SelectDropdown
          ariaLabel={`Statut — ${localNom}`}
          value={statut}
          disabled={update.isPending}
          onValueChange={(v) => {
            changeStatut(v as StatutZone)
          }}
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
