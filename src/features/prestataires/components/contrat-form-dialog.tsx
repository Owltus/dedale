import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { contratSchema, emptyContrat } from '../schemas'
import type { ContratFormValues } from '../schemas'
import { useCreateContrat, useUpdateContrat } from '../mutations'
import { typesContratsQueries } from '../queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { DateField } from '@/components/common/fields/date-field'
import { TextareaField } from '@/components/common/fields/textarea-field'
import { DescriptionField } from '@/components/common/fields/description-field'
import { SelectField } from '@/components/common/fields/select-field'
import { NumberField } from '@/components/common/fields/number-field'
import type { Database } from '@/lib/database.types'

type Contrat = Database['public']['Tables']['contrats']['Row']

interface ContratFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  prestataireId: string
  contrat?: Contrat | null
}

function initialValues(contrat: Contrat | null | undefined): ContratFormValues {
  if (!contrat) return emptyContrat
  return {
    reference: contrat.reference,
    type_contrat_id: String(contrat.type_contrat_id),
    date_debut: contrat.date_debut,
    date_fin: contrat.date_fin ?? '',
    objet_avenant: contrat.objet_avenant ?? '',
    commentaires: contrat.commentaires ?? '',
    duree_cycle_mois: contrat.duree_cycle_mois,
    delai_preavis_jours: contrat.delai_preavis_jours,
    fenetre_resiliation_jours: contrat.fenetre_resiliation_jours,
    date_signature: contrat.date_signature ?? '',
    date_resiliation: contrat.date_resiliation ?? '',
    date_notification: contrat.date_notification ?? '',
  }
}

export function ContratFormDialog({
  open,
  onOpenChange,
  siteId,
  prestataireId,
  contrat,
}: ContratFormDialogProps) {
  const isEdit = Boolean(contrat)
  const create = useCreateContrat()
  const update = useUpdateContrat()
  const { data: types = [] } = useQuery(typesContratsQueries.list())
  const form = useForm<ContratFormValues>({
    resolver: zodResolver(contratSchema),
    defaultValues: initialValues(contrat),
  })
  const submit = useSubmitDialog<ContratFormValues>({
    onSubmit: (data) =>
      contrat
        ? update.mutateAsync({ id: contrat.id, values: data })
        : create.mutateAsync({ siteId, prestataireId, values: data }),
    successMessage: isEdit ? 'Contrat modifié' : 'Contrat créé',
    close: () => onOpenChange(false),
  })

  // Affichage conditionnel par type (1 = Déterminé, 2 = Tacite, 3 = Indéterminé).
  const typeContratId = useWatch({
    control: form.control,
    name: 'type_contrat_id',
  })
  const estTacite = typeContratId === '2'
  const estIndetermine = typeContratId === '3'

  const typeOptions = types.map((t) => ({
    value: String(t.id),
    label: t.libelle,
  }))

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le contrat' : 'Nouveau contrat'}
        description="Renseigne les informations du contrat."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        size="lg"
      >
        <TextField
          control={form.control}
          name="reference"
          label="Référence"
          required
        />
        <SelectField
          control={form.control}
          name="type_contrat_id"
          label="Type de contrat"
          required
          placeholder="— Sélectionner —"
          options={typeOptions}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField
            control={form.control}
            name="date_debut"
            label="Date de début"
            required
          />
          <DateField
            control={form.control}
            name="date_fin"
            label="Date de fin"
          />
        </div>
        <DateField
          control={form.control}
          name="date_signature"
          label="Date de signature"
        />

        {/* ── Reconduction (tacite uniquement) ─────────────────────────────── */}
        {estTacite && (
          <>
            <p className="text-muted-foreground pt-2 text-sm font-medium">
              Reconduction
            </p>
            <NumberField
              control={form.control}
              name="duree_cycle_mois"
              label="Durée d'un cycle"
              unite="mois"
              min={1}
              step={1}
              required
            />
          </>
        )}

        {/* ── Résiliation / préavis ────────────────────────────────────────── */}
        <p className="text-muted-foreground pt-2 text-sm font-medium">
          Résiliation
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            control={form.control}
            name="delai_preavis_jours"
            label="Délai de préavis"
            unite="jours"
            min={0}
            step={1}
            required
          />
          {!estIndetermine && (
            <NumberField
              control={form.control}
              name="fenetre_resiliation_jours"
              label="Fenêtre de résiliation"
              unite="jours"
              min={1}
              step={1}
            />
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateField
            control={form.control}
            name="date_resiliation"
            label="Date de résiliation"
          />
          <DateField
            control={form.control}
            name="date_notification"
            label="Date de notification"
          />
        </div>

        <TextareaField
          control={form.control}
          name="objet_avenant"
          label="Objet de l'avenant"
        />
        <DescriptionField
          control={form.control}
          name="commentaires"
          label="Commentaires"
        />
      </FormDialog>
    </Form>
  )
}
