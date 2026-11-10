import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { validationCapexSchema } from '../schemas'
import type { ValidationCapexFormValues } from '../schemas'
import { formatEuros } from '../format'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/fields/text-field'

interface ValidationInvestissementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  /** Montant demandé : rappelé, et proposé par défaut. */
  montantDemande: number | null
  /** Montant déjà validé, s'il y en a un (il prime sur le demandé). */
  montantPrevu: number | null
  onConfirm: (values: ValidationCapexFormValues) => void
  /** Correction du montant d'un dossier déjà validé (statut inchangé). */
  correction?: boolean
}

/**
 * Valider une demande (demande PO du 10/11/2026) : chaque montant se saisit à
 * son étape — ici le montant accordé, pré-rempli avec le demandé pour qu'un
 * accord « tel quel » ne coûte qu'un clic.
 *
 * Jumeau de `ClotureInvestissementDialog` : l'hôte reste maître de la mutation.
 */
export function ValidationInvestissementDialog({
  open,
  onOpenChange,
  pending,
  montantDemande,
  montantPrevu,
  onConfirm,
  correction = false,
}: ValidationInvestissementDialogProps) {
  const propose = montantPrevu ?? montantDemande
  const form = useForm<ValidationCapexFormValues>({
    resolver: zodResolver(validationCapexSchema),
    defaultValues: {
      montant_prevu: propose === null ? '' : String(propose),
    },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          correction ? 'Modifier le montant validé' : 'Valider la proposition'
        }
        description={
          montantDemande === null
            ? 'Quel montant est accordé ?'
            : `Quel montant est accordé ? Montant proposé : ${formatEuros(montantDemande)}.`
        }
        onSubmit={() => void form.handleSubmit(onConfirm)()}
        submitLabel={correction ? 'Enregistrer' : 'Valider'}
        pendingLabel="Enregistrement…"
        pending={pending}
      >
        <TextField
          control={form.control}
          name="montant_prevu"
          label="Montant validé (€)"
          inputMode="decimal"
        />
      </FormDialog>
    </Form>
  )
}
