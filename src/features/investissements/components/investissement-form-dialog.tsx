import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyInvestissement, investissementSchema } from '../schemas'
import type { InvestissementFormValues } from '../schemas'
import { useCreateInvestissement, useUpdateInvestissement } from '../mutations'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'
import { DateField } from '@/components/common/fields/date-field'
import { DescriptionField } from '@/components/common/fields/description-field'
import type { Database } from '@/lib/database.types'

type Investissement = Database['public']['Tables']['investissements']['Row']

interface InvestissementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  investissement?: Investissement | null
  /**
   * Budget où CRÉER le dossier : celui de la page ouverte, sinon le budget en
   * préparation. Pas de choix dans le formulaire (demande PO) : changer
   * d'année, c'est « Reporter ».
   */
  annee: number
}

function initialValues(
  investissement: Investissement | null | undefined,
  annee: number,
): InvestissementFormValues {
  if (!investissement) return emptyInvestissement(annee)
  return {
    annee_budget: String(investissement.annee_budget),
    libelle: investissement.libelle,
    description: investissement.description ?? '',
    date_demande: investissement.date_demande,
  }
}

export function InvestissementFormDialog({
  open,
  onOpenChange,
  siteId,
  investissement,
  annee,
}: InvestissementFormDialogProps) {
  const isEdit = Boolean(investissement)
  const { session } = useAuth()
  const create = useCreateInvestissement()
  const update = useUpdateInvestissement()
  // Montants gardés en TEXTE (schéma sans transform : `montant` valide une chaîne,
  // `parseMontant` convertit côté mutation) → deux génériques suffisent.
  const form = useForm<InvestissementFormValues>({
    resolver: zodResolver(investissementSchema),
    defaultValues: initialValues(investissement, annee),
  })
  const submit = useSubmitDialog<InvestissementFormValues>({
    onSubmit: (data) => {
      if (investissement) {
        return update.mutateAsync({ id: investissement.id, values: data })
      }
      if (!session) {
        // Session expirée : on interrompt sans toast de succès (message dédié).
        throw new Error('Session expirée, reconnecte-toi.')
      }
      return create.mutateAsync({
        siteId,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Projet modifié' : 'Projet créé',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le projet' : 'Nouveau projet'}
        description={`Budget ${String(investissement?.annee_budget ?? annee)}`}
        size="lg"
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        {/* Ordre de lecture : QUOI → QUAND → le détail en dernier. Ni
            fournisseur ni montant : ils sont portés par les DEVIS du projet
            (147, demande PO du 11/11/2026). */}
        <div className="grid gap-4">
          <TextField
            control={form.control}
            name="libelle"
            label="Libellé"
            required
          />

          {/* Date de proposition. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              control={form.control}
              name="date_demande"
              label="Date de proposition"
              required
            />
          </div>

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
