import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFormContext, useWatch } from 'react-hook-form'
import { referentielsQueries } from '@/features/gammes/queries'
import { TextField } from '@/components/common/fields/text-field'
import { SelectField } from '@/components/common/fields/select-field'
import { DescriptionField } from '@/components/common/fields/description-field'

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
 * Corps RÉUTILISABLE du formulaire d'opération (gammes + modèles), version
 * react-hook-form : lit son `control`/`setValue` du `FormProvider` parent
 * (`<Form {...form}>`). Cascade : Type → (si « Mesure ») Unité → (si l'unité
 * porte des seuils) Seuil min/max. Dès qu'un champ devient masqué, sa valeur est
 * PURGÉE (un champ masqué ne doit jamais porter de valeur, sinon la validation
 * min ≤ max bloque un submit sur un champ invisible). L'hôte porte la validation
 * (Zod) + la mutation.
 */
export function OperationFormBase() {
  const { control, setValue, getValues } = useFormContext<OperationFormValues>()
  const { data: types = [] } = useQuery(referentielsQueries.typesOperations())
  const { data: unites = [] } = useQuery(referentielsQueries.unites())

  const typeId = useWatch({ control, name: 'type_operation_id' })
  const uniteId = useWatch({ control, name: 'unite_id' })

  const { aUnite, requiresSeuils } = resolveOperationFlags(
    { type_operation_id: typeId, unite_id: uniteId },
    types,
    unites,
  )

  // Type « Mesure » → garde l'unité ; sinon purge unité + seuils. Unité
  // « compteur » (sans seuils) → purge les seuils. Réactif : dès qu'un champ est
  // masqué, on efface sa valeur (validation min ≤ max ne doit pas bloquer sur un
  // champ invisible).
  useEffect(() => {
    if (!aUnite && getValues('unite_id') !== '') setValue('unite_id', '')
    if (!requiresSeuils) {
      if (getValues('seuil_minimum') !== '') setValue('seuil_minimum', '')
      if (getValues('seuil_maximum') !== '') setValue('seuil_maximum', '')
    }
  }, [aUnite, requiresSeuils, getValues, setValue])

  const typeOptions = [
    ...types.map((t) => ({ value: String(t.id), label: t.libelle })),
  ]
  const uniteOptions = [
    ...unites.map((u) => ({
      value: String(u.id),
      label: `${u.nom} (${u.symbole})`,
    })),
  ]

  return (
    <>
      <TextField control={control} name="nom" label="Libellé" required />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name="ordre"
          label="Ordre"
          type="number"
          min={0}
        />
        <SelectField
          control={control}
          name="type_operation_id"
          label="Type"
          required
          options={typeOptions}
          placeholder="— Choisir un type —"
        />
      </div>

      {aUnite && (
        <SelectField
          control={control}
          name="unite_id"
          label="Unité"
          required
          options={uniteOptions}
          placeholder="— Choisir une unité —"
        />
      )}

      {requiresSeuils && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            control={control}
            name="seuil_minimum"
            label="Seuil minimum"
            type="number"
          />
          <TextField
            control={control}
            name="seuil_maximum"
            label="Seuil maximum"
            type="number"
          />
        </div>
      )}

      <DescriptionField control={control} name="description" />
    </>
  )
}
