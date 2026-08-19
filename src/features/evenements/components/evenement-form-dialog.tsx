import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { evenementSchema, emptyEvenement } from '../schemas'
import type { EvenementFormValues } from '../schemas'
import { useCreateEvenement, useUpdateEvenement } from '../mutations'
import { evenementsQueries } from '../queries'
import { useQuery } from '@tanstack/react-query'
import { LieuxMultiplesField } from '@/features/equipements/components/lieux-multiples-field'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { isoLocale } from '@/lib/date'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'
import type { Database } from '@/lib/database.types'

type Evenement = Database['public']['Tables']['evenements']['Row']

interface EvenementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  evenement?: Evenement | null
  /** Appelé après une CRÉATION réussie (l'hôte redirige vers la fiche). */
  onCreated?: (evenement: Evenement) => void
}

export function EvenementFormDialog({
  open,
  onOpenChange,
  siteId,
  evenement,
  onCreated,
}: EvenementFormDialogProps) {
  const isEdit = Boolean(evenement)
  const { session } = useAuth()
  const create = useCreateEvenement()
  const update = useUpdateEvenement()
  // En édition, les lieux DÉJÀ enregistrés préremplissent le tableau — pas de
  // requête en création (rien à charger, le tableau démarre vide).
  const { data: lieuxExistants } = useQuery({
    ...evenementsQueries.lieux(evenement?.id ?? ''),
    enabled: isEdit,
  })

  const form = useForm<EvenementFormValues>({
    resolver: zodResolver(evenementSchema),
    values: evenement
      ? {
          titre: evenement.titre,
          description: evenement.description ?? '',
          date_evenement: evenement.date_evenement,
          lieux: (lieuxExistants ?? []).map((l) => ({
            local_id: l.local_id,
            equipement_id: l.equipement_id ?? '',
          })),
        }
      : undefined,
    defaultValues: emptyEvenement(isoLocale(new Date())),
  })

  // `LieuxMultiplesField` est IMPÉRATIF (`value`/`onChange`) : ponté à
  // react-hook-form via `useWatch`/`setValue`, comme `LocalEquipementFields`.
  const lieux = useWatch({ control: form.control, name: 'lieux' })

  const submit = useSubmitDialog<EvenementFormValues, Evenement | null>({
    onSubmit: async (data) => {
      if (evenement) {
        await update.mutateAsync({ id: evenement.id, values: data })
        return null
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      return create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Événement modifié' : 'Événement consigné',
    close: () => onOpenChange(false),
    onSuccess: (cree) => {
      if (cree && onCreated) onCreated(cree)
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier l’événement' : 'Consigner un événement'}
        description="Ce qui s’est passé dans l’établissement. Le lieu est facultatif — tu peux en ajouter plusieurs."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Consigner'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        size="lg"
      >
        <TextField
          control={form.control}
          name="titre"
          label="Que s’est-il passé ?"
          required
        />
        <DateField
          control={form.control}
          name="date_evenement"
          label="Date de l’événement"
          required
        />
        <DescriptionField control={form.control} name="description" rows={5} />

        {/* 086 : un ou plusieurs lieux, ajoutés/retouchés directement ici —
            « meilleur des deux mondes » (décision PO) : la commodité déjà
            présente (choisir le lieu depuis ce formulaire) étendue au
            multi-lieux (comme Travaux). */}
        <LieuxMultiplesField
          siteId={siteId}
          value={lieux}
          onChange={(next) => form.setValue('lieux', next)}
        />
      </FormDialog>
    </Form>
  )
}
