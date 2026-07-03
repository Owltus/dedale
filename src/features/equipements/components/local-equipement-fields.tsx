import { useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { equipementsQueries } from '../queries'
import { SelectField } from '@/components/common/select-field'

interface LocalEquipementFieldsProps {
  /** Site actif : périmètre des équipements chargés. */
  siteId: string
  /** `local_id` sélectionné, ou '' si aucun (contrôlé par l'hôte). */
  localId: string
  /** `equipement_id` sélectionné, ou '' si aucun (contrôlé par l'hôte). */
  equipementId: string
  /**
   * Remonte le couple complet à CHAQUE changement. Changer de lieu renvoie
   * TOUJOURS `equipementId: ''` (l'équipement doit appartenir au lieu).
   */
  onChange: (next: { localId: string; equipementId: string }) => void
  /**
   * Sélecteur de LIEU, VARIABLE selon l'écran (`LocalSearchSelect`,
   * `EmplacementSelect`…). Reçoit la valeur contrôlée, le `onChange` qui VIDE
   * l'équipement, l'`error` du lieu et le `siteId` ; l'hôte l'étale sur le
   * composant de son choix (+ ses props propres : `label`, `aside`…).
   */
  renderLieu: (props: {
    siteId: string
    value: string
    onChange: (localId: string) => void
    error?: string
  }) => ReactNode
  /** Erreurs de validation par nom de champ de schéma (`local_id` / `equipement_id`). */
  errors?: { local_id?: string; equipement_id?: string }
  /** Libellé du champ Équipement (défaut « Équipement »). */
  equipementLabel?: string
  /** `id` DOM du select Équipement (liaison label ; optionnel). */
  equipementSelectId?: string
  /**
   * Désactive AUSSI le select Équipement quand le lieu choisi n'a aucun
   * équipement (défaut `false` : il reste actif avec la seule option « Aucun »).
   */
  disableEquipementWhenEmpty?: boolean
}

/**
 * Cascade « Localisation → Équipement du local » réutilisable : un sélecteur de
 * lieu (fourni via `renderLieu`) suivi d'un select Équipement borné aux
 * équipements du lieu choisi. Porte la requête `equipementsQueries.list`, le
 * filtrage par `local_id` et la règle « changer de lieu réinitialise
 * l'équipement ». L'hôte reste maître de l'état (`localId` / `equipementId`) et du
 * composant de lieu ; ce champ ne rend que la mécanique commune (DI, tâches de
 * travaux…).
 */
export function LocalEquipementFields({
  siteId,
  localId,
  equipementId,
  onChange,
  renderLieu,
  errors,
  equipementLabel = 'Équipement',
  equipementSelectId,
  disableEquipementWhenEmpty = false,
}: LocalEquipementFieldsProps) {
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))

  // Équipements DU lieu choisi (sinon liste vide → select réduit à « Aucun »).
  const equipementsDuLocal = useMemo(
    () =>
      localId === '' ? [] : equipements.filter((e) => e.local_id === localId),
    [equipements, localId],
  )

  return (
    <>
      {renderLieu({
        siteId,
        value: localId,
        // Changer de lieu VIDE l'équipement (il doit appartenir au lieu).
        onChange: (id) => onChange({ localId: id, equipementId: '' }),
        error: errors?.local_id,
      })}

      <SelectField
        id={equipementSelectId}
        label={equipementLabel}
        value={equipementId}
        onChange={(id) => onChange({ localId, equipementId: id })}
        disabled={
          localId === '' ||
          (disableEquipementWhenEmpty && equipementsDuLocal.length === 0)
        }
        error={errors?.equipement_id}
      >
        <option value="">Aucun</option>
        {equipementsDuLocal.map((eq) => (
          <option key={eq.id ?? ''} value={eq.id ?? ''}>
            {eq.nom}
          </option>
        ))}
      </SelectField>
    </>
  )
}
