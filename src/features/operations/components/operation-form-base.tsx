import { useQuery } from '@tanstack/react-query'
import { referentielsQueries } from '@/features/gammes/queries'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { DescriptionField } from '@/components/common/description-field'

/**
 * Valeurs du formulaire d'opération, PARTAGÉES par les opérations de gamme et les
 * items de modèle (mêmes champs). Tout en `string` (valeurs d'inputs) ; la
 * conversion/validation reste à la charge de chaque feature (Zod + mutation).
 */
export interface OperationFormValues {
  nom: string
  ordre: string
  type_operation_id: string
  unite_id: string
  seuil_minimum: string
  seuil_maximum: string
  description: string
}

/** Valeurs vides (l'ordre est fixé par l'hôte selon le contexte). */
export const EMPTY_OPERATION_FORM: OperationFormValues = {
  nom: '',
  ordre: '',
  type_operation_id: '',
  unite_id: '',
  seuil_minimum: '',
  seuil_maximum: '',
  description: '',
}

interface FlaggedRef {
  id: number
  necessite_seuils: boolean
}

/**
 * Résout, depuis le type et l'unité choisis, les deux drapeaux de la cascade :
 * - `aUnite` : le type est « Mesure » (`types_operations.necessite_seuils`) → une
 *   unité est requise ;
 * - `requiresSeuils` : l'unité choisie porte des seuils (`unites.necessite_seuils`).
 *
 * Utilisé par le formulaire (affichage) ET par les payloads de mutation
 * (nullification : on garde l'unité pour une Mesure, mais on coupe les seuils
 * pour une unité « compteur »).
 */
export function resolveOperationFlags(
  values: Pick<OperationFormValues, 'type_operation_id' | 'unite_id'>,
  types: FlaggedRef[],
  unites: FlaggedRef[],
): { aUnite: boolean; requiresSeuils: boolean } {
  const aUnite =
    types.find((t) => String(t.id) === values.type_operation_id)
      ?.necessite_seuils ?? false
  const uniteSeuils =
    unites.find((u) => String(u.id) === values.unite_id)?.necessite_seuils ??
    false
  return { aUnite, requiresSeuils: aUnite && uniteSeuils }
}

/**
 * Corps RÉUTILISABLE du formulaire d'opération (gammes + modèles). Cascade :
 * Type → (si « Mesure ») Unité → (si l'unité porte des seuils) Seuil min/max.
 * Au changement de type/unité, les champs devenus masqués sont PURGÉS (un champ
 * masqué ne doit jamais porter de valeur, sinon la validation min ≤ max bloque
 * un submit sur un champ invisible). L'hôte fournit `values`/`onChange`/`errors`
 * et gère sa propre validation + mutation.
 */
export function OperationFormBase({
  values,
  onChange,
  errors,
}: {
  values: OperationFormValues
  onChange: (values: OperationFormValues) => void
  errors: Record<string, string>
}) {
  const { data: types = [] } = useQuery(referentielsQueries.typesOperations())
  const { data: unites = [] } = useQuery(referentielsQueries.unites())

  const { aUnite, requiresSeuils } = resolveOperationFlags(
    values,
    types,
    unites,
  )

  function set(key: keyof OperationFormValues, value: string) {
    onChange({ ...values, [key]: value })
  }

  // Type « Mesure » → garde l'unité ; sinon purge unité + seuils.
  function onTypeChange(typeId: string) {
    const nextAUnite =
      types.find((t) => String(t.id) === typeId)?.necessite_seuils ?? false
    onChange({
      ...values,
      type_operation_id: typeId,
      unite_id: nextAUnite ? values.unite_id : '',
      seuil_minimum: nextAUnite ? values.seuil_minimum : '',
      seuil_maximum: nextAUnite ? values.seuil_maximum : '',
    })
  }

  // Unité « compteur » (sans seuils) → purge les seuils.
  function onUniteChange(uniteId: string) {
    const nextSeuils =
      unites.find((u) => String(u.id) === uniteId)?.necessite_seuils ?? false
    onChange({
      ...values,
      unite_id: uniteId,
      seuil_minimum: nextSeuils ? values.seuil_minimum : '',
      seuil_maximum: nextSeuils ? values.seuil_maximum : '',
    })
  }

  return (
    <>
      <TextField
        label="Libellé"
        value={values.nom}
        onChange={(v) => set('nom', v)}
        error={errors.nom}
        required
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Ordre"
          type="number"
          min={0}
          value={values.ordre}
          onChange={(v) => set('ordre', v)}
          error={errors.ordre}
        />
        <SelectField
          label="Type"
          required
          id="op_type"
          value={values.type_operation_id}
          onChange={onTypeChange}
          error={errors.type_operation_id}
        >
          <option value="">— Choisir un type —</option>
          {types.map((t) => (
            <option key={t.id} value={String(t.id)}>
              {t.libelle}
            </option>
          ))}
        </SelectField>
      </div>

      {aUnite && (
        <SelectField
          label="Unité"
          required
          id="op_unite"
          value={values.unite_id}
          onChange={onUniteChange}
          error={errors.unite_id}
        >
          <option value="">— Choisir une unité —</option>
          {unites.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.nom} ({u.symbole})
            </option>
          ))}
        </SelectField>
      )}

      {requiresSeuils && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Seuil minimum"
            type="number"
            value={values.seuil_minimum}
            onChange={(v) => set('seuil_minimum', v)}
            error={errors.seuil_minimum}
          />
          <TextField
            label="Seuil maximum"
            type="number"
            value={values.seuil_maximum}
            onChange={(v) => set('seuil_maximum', v)}
            error={errors.seuil_maximum}
          />
        </div>
      )}

      <DescriptionField
        id="op_description"
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
    </>
  )
}
