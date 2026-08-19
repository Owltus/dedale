import { Plus, Trash2 } from 'lucide-react'
import { LocalEquipementFields } from './local-equipement-fields'
import { EmplacementSelect } from './emplacement-select'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

export interface LieuEntree {
  local_id: string
  equipement_id: string
}

interface LieuxMultiplesFieldProps {
  /** Site actif : périmètre des locaux/équipements chargés. */
  siteId: string
  /** Lieux déjà ajoutés (contrôlé par l'hôte). */
  value: LieuEntree[]
  onChange: (value: LieuEntree[]) => void
}

/**
 * Ajout d'UN OU PLUSIEURS lieux (local + équipement optionnel) directement
 * dans une modale de création — le « meilleur des deux mondes » entre Travaux
 * (plusieurs zones possibles, mais seulement après coup depuis la fiche) et
 * Événements (un seul lieu, mais choisi dès la création). Composant IMPÉRATIF
 * (`value`/`onChange`), sur le même principe que `LocalEquipementFields`
 * lui-même : l'hôte le ponte à react-hook-form via `useWatch`/`setValue`.
 *
 * Aucune validation bloquante : une ligne ajoutée puis laissée vide (l'usager
 * change d'avis) est simplement filtrée par l'appelant à la soumission — le
 * lieu reste facultatif.
 */
export function LieuxMultiplesField({
  siteId,
  value,
  onChange,
}: LieuxMultiplesFieldProps) {
  // Un même local ne peut pas être ajouté deux fois — exclu du sélecteur des
  // AUTRES lignes (pas de la sienne, sinon son propre choix disparaîtrait).
  function autresLocaux(indexCourant: number): string[] {
    return value
      .filter((_, i) => i !== indexCourant)
      .map((l) => l.local_id)
      .filter(Boolean)
  }

  return (
    <div className="space-y-3">
      <Label>Lieux concernés (facultatif)</Label>

      {value.map((entree, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1">
            <LocalEquipementFields
              siteId={siteId}
              localId={entree.local_id}
              equipementId={entree.equipement_id}
              onChange={({ localId, equipementId }) => {
                const next = [...value]
                next[i] = { local_id: localId, equipement_id: equipementId }
                onChange(next)
              }}
              equipementLabel="Équipement concerné"
              equipementEnAside
              renderLieu={(p) => (
                <EmplacementSelect
                  {...p}
                  requiredEmplacement={false}
                  excludeLocalIds={autresLocaux(i)}
                />
              )}
            />
          </div>
          <div className="mt-6">
            <TooltipIconButton
              icon={<Trash2 />}
              label="Retirer ce lieu"
              variant="ghost"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...value, { local_id: '', equipement_id: '' }])
        }
      >
        <Plus /> Ajouter un lieu
      </Button>
    </div>
  )
}
