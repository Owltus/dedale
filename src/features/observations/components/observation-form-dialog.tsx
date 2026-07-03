import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { otsPourObservationQueries } from '../queries'
import {
  GRAVITES,
  LIBELLES_GRAVITE,
  LIBELLES_SOURCE,
  SOURCES,
  emptyObservationCreate,
  observationCreateSchema,
} from '../schemas'
import type { ObservationCreateValues } from '../schemas'
import { useCreateObservation } from '../mutations'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'
import { SelectField } from '@/components/common/fields/select-field'
import { RadioField } from '@/components/common/fields/radio-field'

interface ObservationFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  createdBy: string
}

// Aide brève par source : la ligne « contrôle réglementaire » rappelle l'exigence
// d'un ordre de travail rattaché (miroir du CHECK backend / validation Zod).
const DESCRIPTIONS_SOURCE: Record<string, string> = {
  controle_reglementaire: 'Vérification périodique obligatoire ; impose un ordre de travail.',
  commission_securite: 'Passage de la commission de sécurité.',
  inspection_interne: 'Contrôle mené par vos équipes.',
}

/**
 * Création d'une observation rattachée (optionnellement) à un OT du site.
 * Le rattachement à un équipement est dérivé de l'OT choisi. Un contrôle
 * réglementaire impose un OT (CHECK backend, doublé d'une validation Zod).
 */
export function ObservationFormDialog({
  open,
  onOpenChange,
  siteId,
  createdBy,
}: ObservationFormDialogProps) {
  const { data: ots = [] } = useQuery(otsPourObservationQueries.list(siteId))
  const create = useCreateObservation()

  const form = useForm<ObservationCreateValues>({
    resolver: zodResolver(observationCreateSchema),
    defaultValues: emptyObservationCreate(),
  })
  const submit = useSubmitDialog<ObservationCreateValues>({
    onSubmit: (data) => create.mutateAsync({ siteId, createdBy, values: data }),
    successMessage: 'Observation créée',
    close: () => onOpenChange(false),
  })

  // Un contrôle réglementaire impose un OT → l'astérisque « requis » suit la source.
  const source = useWatch({ control: form.control, name: 'source' })

  const sourceOptions = SOURCES.map((s) => ({
    value: s,
    label: LIBELLES_SOURCE[s] ?? '',
    description: DESCRIPTIONS_SOURCE[s],
  }))
  const graviteOptions = GRAVITES.map((g) => ({
    value: g,
    label: LIBELLES_GRAVITE[g] ?? '',
  }))
  const otOptions = [
    { value: '', label: '— Aucun —' },
    ...ots.map((o) => ({
      value: o.id,
      label: `${o.nom_gamme}${o.nom_equipement ? ` — ${o.nom_equipement}` : ''}`,
    })),
  ]

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Nouvelle observation"
        description="Réserve ou non-conformité de sécurité. Rattachez-la à un ordre de travail si elle découle d'un contrôle."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Créer"
        pendingLabel="Création…"
        pending={form.formState.isSubmitting}
      >
        <RadioField
          control={form.control}
          name="source"
          label="Source"
          required
          options={sourceOptions}
        />

        <RadioField
          control={form.control}
          name="gravite"
          label="Gravité"
          required
          options={graviteOptions}
        />

        <DescriptionField control={form.control} name="description" required />

        <DateField
          control={form.control}
          name="echeance"
          label="Échéance"
        />

        <SelectField
          control={form.control}
          name="ot_id"
          label="Ordre de travail"
          required={source === 'controle_reglementaire'}
          hint={
            source === 'controle_reglementaire'
              ? 'Obligatoire pour un contrôle réglementaire'
              : undefined
          }
          options={otOptions}
        />
      </FormDialog>
    </Form>
  )
}
