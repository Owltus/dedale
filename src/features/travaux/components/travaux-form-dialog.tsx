import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { travauxSchema, emptyTravaux } from '../schemas'
import type { TravauxFormValues } from '../schemas'
import { useCreateTravaux, useUpdateTravaux } from '../mutations'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { DescriptionField } from '@/components/common/fields/description-field'
import type { Database } from '@/lib/database.types'

type Travaux = Database['public']['Tables']['interventions_travaux']['Row']

interface TravauxFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  travaux?: Travaux | null
  /**
   * Appelé après une CRÉATION réussie, avec le travail créé. L'hôte (liste)
   * s'en sert pour rediriger vers la fiche où l'on ajoute les tâches.
   */
  onCreated?: (travaux: Travaux) => void
}

function initialValues(travaux: Travaux | null | undefined): TravauxFormValues {
  if (!travaux) return emptyTravaux()
  return { titre: travaux.titre, description: travaux.description ?? '' }
}

export function TravauxFormDialog({
  open,
  onOpenChange,
  siteId,
  travaux,
  onCreated,
}: TravauxFormDialogProps) {
  const isEdit = Boolean(travaux)
  const { session } = useAuth()
  const create = useCreateTravaux()
  const update = useUpdateTravaux()

  const form = useForm<TravauxFormValues>({
    resolver: zodResolver(travauxSchema),
    defaultValues: initialValues(travaux),
  })
  const submit = useSubmitDialog<TravauxFormValues, Travaux | null>({
    onSubmit: async (data) => {
      if (travaux) {
        await update.mutateAsync({ id: travaux.id, values: data })
        return null
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      return create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Travaux modifié' : 'Travaux créé',
    close: () => onOpenChange(false),
    // Redirection vers la fiche uniquement après une CRÉATION (édition → null).
    onSuccess: (created) => {
      if (created) onCreated?.(created)
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le travaux' : 'Nouveau travaux'}
        description="Travaux ponctuels du site. Les tâches s'ajoutent ensuite sur la fiche."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
        // Pas de grille à deux colonnes ici : les deux champs sont de la saisie
        // libre, ils prennent donc toute la largeur (patron de dimensionnement).
        // C'est la LARGEUR du dialogue qui manquait.
        size="lg"
      >
        <TextField control={form.control} name="titre" label="Titre" required />
        {/* La description d'un travaux n'est pas un champ d'appoint : on y
            consigne le déroulé du chantier, souvent sur plusieurs lignes
            (livraison, mise en service, enlèvement…). Deux lignes obligeaient à
            se relire par une fente. */}
        <DescriptionField control={form.control} name="description" rows={5} />
      </FormDialog>
    </Form>
  )
}
