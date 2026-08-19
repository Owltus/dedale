import { Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { equipementsQueries } from '../queries'
import { LocalEquipementFields } from './local-equipement-fields'
import { EmplacementSelect } from './emplacement-select'
import { TooltipIconButton } from '@/components/common/tooltip-icon-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface TacheEntree {
  /** Présent = ligne déjà existante en base (édition) ; absent = nouvelle ligne. */
  id?: string
  libelle: string
  local_id: string
  equipement_id: string
}

interface TachesMultiplesFieldProps {
  /** Site actif : périmètre des locaux/équipements chargés. */
  siteId: string
  /** Tâches déjà ajoutées (contrôlé par l'hôte). */
  value: TacheEntree[]
  onChange: (value: TacheEntree[]) => void
}

/**
 * Ajout d'UNE OU PLUSIEURS tâches (090, généralisées) directement dans une
 * modale de création — libellé libre en identité, lieu (local + équipement)
 * facultatif. Composant IMPÉRATIF (`value`/`onChange`), sur le même principe
 * que `LocalEquipementFields` lui-même : l'hôte le ponte à react-hook-form via
 * un état local (cf. commentaire dans `travaux-form-dialog.tsx`).
 *
 * Aucune validation bloquante : une ligne ajoutée puis laissée entièrement
 * vide (l'usager change d'avis) est simplement filtrée par l'appelant à la
 * soumission — le libellé ET le lieu sont facultatifs à ce stade (le libellé
 * ne devient réellement requis qu'à l'écriture, avec un repli générique).
 */
export function TachesMultiplesField({
  siteId,
  value,
  onChange,
}: TachesMultiplesFieldProps) {
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))

  // Un même local ne peut pas être ajouté deux fois — exclu du sélecteur des
  // AUTRES lignes (pas de la sienne, sinon son propre choix disparaîtrait).
  function autresLocaux(indexCourant: number): string[] {
    return value
      .filter((_, i) => i !== indexCourant)
      .map((t) => t.local_id)
      .filter(Boolean)
  }

  return (
    <div className="space-y-3">
      <Label>Tâches (facultatif)</Label>

      {value.map((entree, i) => (
        <div
          key={entree.id ?? `nouvelle-${String(i)}`}
          className="flex items-start gap-2 rounded-md border p-3"
        >
          <div className="flex-1 space-y-3">
            <Input
              value={entree.libelle}
              onChange={(e) => {
                const next = [...value]
                next[i] = { ...entree, libelle: e.target.value }
                onChange(next)
              }}
              placeholder="Ex. Livraison et déballage"
              aria-label="Libellé de la tâche"
            />
            <LocalEquipementFields
              siteId={siteId}
              localId={entree.local_id}
              equipementId={entree.equipement_id}
              onChange={({ localId, equipementId }) => {
                const next = [...value]
                // Propose le nom du local comme libellé SEULEMENT si l'usager
                // n'a encore rien saisi — ne verrouille jamais un libellé déjà
                // tapé (cas chronologique : le lieu ne doit pas écraser le nom
                // de l'étape).
                const libelle =
                  entree.libelle === '' && localId !== ''
                    ? (locaux.find((l) => l.local_id === localId)?.local_nom ??
                      entree.libelle)
                    : entree.libelle
                next[i] = {
                  ...entree,
                  local_id: localId,
                  equipement_id: equipementId,
                  libelle,
                }
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
          <div className="mt-1">
            <TooltipIconButton
              icon={<Trash2 />}
              label="Retirer cette tâche"
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
          onChange([...value, { libelle: '', local_id: '', equipement_id: '' }])
        }
      >
        <Plus /> Ajouter une tâche
      </Button>
    </div>
  )
}
