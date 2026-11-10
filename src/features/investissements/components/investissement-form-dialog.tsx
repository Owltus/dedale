import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyInvestissement, investissementSchema } from '../schemas'
import type { InvestissementFormValues } from '../schemas'
import { useCreateInvestissement, useUpdateInvestissement } from '../mutations'
import { ID_REALISE, ID_VALIDE } from '../etat'
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

function montantToText(value: number | null): string {
  return value === null ? '' : String(value)
}

function initialValues(
  investissement: Investissement | null | undefined,
  annee: number,
): InvestissementFormValues {
  if (!investissement) return emptyInvestissement(annee)
  return {
    annee_budget: String(investissement.annee_budget),
    libelle: investissement.libelle,
    fournisseur: investissement.fournisseur ?? '',
    description: investissement.description ?? '',
    montant_demande: montantToText(investissement.montant_demande),
    montant_prevu: montantToText(investissement.montant_prevu),
    depense_reelle: montantToText(investissement.depense_reelle),
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
  // Chaque montant à son étape (demande PO) : le validé se saisit en validant,
  // le réel en marquant réalisé. En modification, on ne montre que ceux que
  // le dossier a déjà atteints.
  const statut = investissement?.statut_capex_id
  const voitValide = statut === ID_VALIDE || statut === ID_REALISE
  const voitReel = statut === ID_REALISE
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
    successMessage: isEdit ? 'Investissement modifié' : 'Investissement créé',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? "Modifier l'investissement" : 'Nouvel investissement'}
        description={`Budget ${String(investissement?.annee_budget ?? annee)}`}
        size="lg"
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        {/* Ordre de lecture : QUOI → QUAND → COMBIEN → le détail en dernier.
            La description était coincée entre le libellé et les montants, ce qui
            séparait l'investissement de son budget ; et la date se retrouvait
            seule tout en bas, après une ligne à trois champs. */}
        <div className="grid gap-4">
          <TextField
            control={form.control}
            name="libelle"
            label="Libellé"
            required
          />
          <TextField
            control={form.control}
            name="fournisseur"
            label="Fournisseur"
            placeholder="Qui a fait le devis ?"
          />

          {/* Date et montants : champs courts en 2 colonnes. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              control={form.control}
              name="date_demande"
              label="Date de proposition"
              required
            />
            <TextField
              control={form.control}
              name="montant_demande"
              label="Montant proposé (€)"
              inputMode="decimal"
            />
            {voitValide && (
              <TextField
                control={form.control}
                name="montant_prevu"
                label="Montant validé (€)"
                inputMode="decimal"
              />
            )}
            {voitReel && (
              <TextField
                control={form.control}
                name="depense_reelle"
                label="Dépense réelle (€)"
                inputMode="decimal"
              />
            )}
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
