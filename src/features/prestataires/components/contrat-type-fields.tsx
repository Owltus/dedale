import type { Control } from 'react-hook-form'
import { useWatch } from 'react-hook-form'
import type { ContratFormValues } from '../schemas'
import { TextField } from '@/components/common/fields/text-field'
import { DateField } from '@/components/common/fields/date-field'
import { SelectField } from '@/components/common/fields/select-field'
import { NumberField } from '@/components/common/fields/number-field'
import { TextareaField } from '@/components/common/fields/textarea-field'
import { DescriptionField } from '@/components/common/fields/description-field'

interface ContratTypeFieldsProps {
  control: Control<ContratFormValues>
  typeOptions: { value: string; label: string }[]
}

/**
 * Champs communs d'un contrat, avec affichage CONDITIONNEL par type
 * (1 = Déterminé, 2 = Tacite, 3 = Indéterminé). Factorisé pour être partagé par
 * le formulaire de contrat (création/édition) ET le dialog d'avenant, afin de ne
 * pas dupliquer la logique conditionnelle. Les champs masqués gardent une valeur
 * en mémoire ; c'est `contratPayload` (mutations) qui neutralise à la persistance.
 */
export function ContratTypeFields({
  control,
  typeOptions,
}: ContratTypeFieldsProps) {
  const typeContratId = useWatch({ control, name: 'type_contrat_id' })
  const estTacite = typeContratId === '2'
  const estIndetermine = typeContratId === '3'

  return (
    <>
      <TextField
        control={control}
        name="reference"
        label="Référence"
        required
      />
      <SelectField
        control={control}
        name="type_contrat_id"
        label="Type de contrat"
        required
        placeholder="— Choisir un type —"
        options={typeOptions}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateField
          control={control}
          name="date_debut"
          label="Date de début"
          required
        />
        <DateField control={control} name="date_fin" label="Date de fin" />
      </div>
      <DateField
        control={control}
        name="date_signature"
        label="Date de signature"
      />

      {/* ── Reconduction (tacite uniquement) ─────────────────────────────── */}
      {estTacite && (
        <>
          <p className="pt-2 text-sm font-medium text-muted-foreground">
            Reconduction
          </p>
          <NumberField
            control={control}
            name="duree_cycle_mois"
            label="Durée d’un cycle"
            unite="mois"
            min={1}
            step={1}
            required
          />
        </>
      )}

      {/* ── Résiliation / préavis ────────────────────────────────────────── */}
      <p className="pt-2 text-sm font-medium text-muted-foreground">
        Résiliation
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          control={control}
          name="delai_preavis_jours"
          label="Délai de préavis"
          unite="jours"
          min={0}
          step={1}
          required
        />
        {!estIndetermine && (
          <NumberField
            control={control}
            name="fenetre_resiliation_jours"
            label="Fenêtre de résiliation"
            unite="jours"
            min={1}
            step={1}
          />
        )}
      </div>

      <TextareaField
        control={control}
        name="objet_avenant"
        label="Objet de l’avenant"
      />
      <DescriptionField
        control={control}
        name="commentaires"
        label="Commentaires"
      />
    </>
  )
}
