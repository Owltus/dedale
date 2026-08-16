import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clotureSchema } from '../schemas'
import type { ClotureFormValues } from '../schemas'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { DescriptionField } from '@/components/common/fields/description-field'

interface ClotureEvenementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onConfirm: (compteRendu: string) => void
}

/**
 * Clôture d'un événement, avec compte-rendu.
 *
 * Le compte-rendu est PROPOSÉ mais pas exigé — contrairement aux travaux, où le
 * backend le refuse vide. Un événement peut être clos sans qu'aucune action ait
 * été nécessaire (fausse alerte, remise en route spontanée) : imposer un texte
 * pousserait à écrire « RAS », ce qui ne renseigne personne.
 *
 * L'hôte reste maître de la mutation : ce dialogue ne fait que collecter.
 */
export function ClotureEvenementDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: ClotureEvenementDialogProps) {
  const form = useForm<ClotureFormValues>({
    resolver: zodResolver(clotureSchema),
    defaultValues: { compte_rendu: '' },
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Clôturer l’événement"
        description="Ce qui a été fait, ou pourquoi il n’y avait rien à faire. Facultatif."
        onSubmit={() =>
          void form.handleSubmit((data) => {
            onConfirm(data.compte_rendu)
          })()
        }
        submitLabel="Clôturer"
        pendingLabel="Clôture…"
        pending={pending}
      >
        <DescriptionField
          control={form.control}
          name="compte_rendu"
          label="Compte-rendu"
        />
      </FormDialog>
    </Form>
  )
}
