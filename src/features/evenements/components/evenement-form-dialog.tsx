import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { evenementSchema, emptyEvenement } from '../schemas'
import type { EvenementFormValues } from '../schemas'
import { useCreateEvenement, useUpdateEvenement } from '../mutations'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { EmplacementSelect } from '@/features/equipements/components/emplacement-select'
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

function initialValues(
  evenement: Evenement | null | undefined,
): EvenementFormValues {
  if (!evenement) return emptyEvenement(isoLocale(new Date()))
  return {
    titre: evenement.titre,
    description: evenement.description ?? '',
    date_evenement: evenement.date_evenement,
    local_id: evenement.local_id ?? '',
    equipement_id: evenement.equipement_id ?? '',
  }
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

  const form = useForm<EvenementFormValues>({
    resolver: zodResolver(evenementSchema),
    defaultValues: initialValues(evenement),
  })

  // `LocalEquipementFields` est un composant IMPÉRATIF (`value`/`onChange`) : on
  // le ponte à react-hook-form par `useWatch` en lecture et `setValue` en
  // écriture, comme le prescrit la recette des pages.
  const localId = useWatch({ control: form.control, name: 'local_id' })
  const equipementId = useWatch({
    control: form.control,
    name: 'equipement_id',
  })

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
        description="Ce qui s’est passé dans l’établissement. Le lieu et l’équipement sont facultatifs."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Consigner'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        // `lg` : trois champs de lieu empilés dans une modale étroite obligeaient
        // à faire défiler pour atteindre le bouton. En deux colonnes, le
        // formulaire tient d'un seul regard.
        size="lg"
      >
        {/* Deux champs PLEINE LARGEUR (le titre, la description) encadrent un
            bloc central de quatre champs courts rangés en 2 × 2 :

              Niveau │ Date de l'événement
              Local  │ Équipement concerné

            La colonne gauche porte la cascade du lieu (du plus large au plus
            précis), la droite le reste. Chaque ligne est donc pleine — la
            version précédente alternait une ligne à un champ, une à deux, puis
            encore une à un. */}
        <div className="grid gap-4">
          <TextField
            control={form.control}
            name="titre"
            label="Que s’est-il passé ?"
            required
          />

          <LocalEquipementFields
            siteId={siteId}
            localId={localId}
            equipementId={equipementId}
            onChange={({ localId: l, equipementId: e }) => {
              form.setValue('local_id', l)
              form.setValue('equipement_id', e)
            }}
            equipementLabel="Équipement concerné"
            equipementEnAside
            errors={{
              local_id: form.formState.errors.local_id?.message,
              equipement_id: form.formState.errors.equipement_id?.message,
            }}
            renderLieu={({ siteId: s, value, onChange, error, aside }) => (
              <EmplacementSelect
                siteId={s}
                value={value}
                onChange={onChange}
                error={error}
                // La colonne droite reçoit la date PUIS l'équipement, en regard
                // de Niveau et Local : c'est ce qui remplit les deux lignes.
                aside={
                  <div className="grid gap-4">
                    <DateField
                      control={form.control}
                      name="date_evenement"
                      label="Date de l’événement"
                      required
                    />
                    {aside}
                  </div>
                }
                // Le lieu est FACULTATIF pour un événement : on peut consigner
                // sans savoir encore où cela s'est produit.
                requiredEmplacement={false}
              />
            )}
          />

          {/* Plus haut que le défaut de l'app : c'est ici qu'on décrit ce qui
              s'est passé, et le formulaire a la place. */}
          <DescriptionField
            control={form.control}
            name="description"
            rows={5}
          />
        </div>
      </FormDialog>
    </Form>
  )
}
