import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { contratSchema, emptyContrat } from '../schemas'
import type { ContratFormValues } from '../schemas'
import { useCreateContrat, useUpdateContrat } from '../mutations'
import { typesContratsQueries } from '../queries'
import { ContratTypeFields } from './contrat-type-fields'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
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
        <ContratTypeFields control={form.control} typeOptions={typeOptions} />
      </FormDialog>
    </Form>
  )
}
