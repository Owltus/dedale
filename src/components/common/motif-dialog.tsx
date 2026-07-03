import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/fields/textarea-field'

// Motif obligatoire et borné (miroir des garde-fous backend : CHECK
// motif_annulation, p_motif des RPC). Schéma local : la brique commune ne
// dépend d'aucune feature.
const motifSchema = z.object({
  motif: z.string().trim().min(1, 'Le motif est obligatoire').max(2000),
})

type MotifValues = z.infer<typeof motifSchema>

interface MotifDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  onConfirm: (motif: string) => void
  /** Libellé du champ de saisie (défaut « Motif »). */
  label?: string
  /** Hauteur du champ de saisie, en lignes (défaut 4). */
  rows?: number
}

/**
 * Dialog générique « motif obligatoire » : une action qui exige un texte de
 * justification avant de s'exécuter — annuler un OT (motif_annulation), le
 * rouvrir (RPC reouvrir_ot, p_motif), clôturer des travaux avec compte-rendu…
 * L'appelant fait la mutation dans `onConfirm` (le motif arrive déjà validé).
 */
export function MotifDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  pending,
  onConfirm,
  label = 'Motif',
  rows = 4,
}: MotifDialogProps) {
  const form = useForm<MotifValues>({
    resolver: zodResolver(motifSchema),
    defaultValues: { motif: '' },
  })

  // Contrairement aux autres modales, la plomberie de succès (toast + fermeture)
  // reste chez l'APPELANT : c'est lui qui pilote `pending` via sa mutation, ferme
  // le dialogue et notifie. On ne passe donc PAS par `useSubmitDialog` (qui, lui,
  // toasterait et fermerait) — le resolver valide, puis on relaie à `onConfirm`.
  const submit = ({ motif }: MotifValues) => onConfirm(motif)

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={description}
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={confirmLabel}
        pendingLabel="En cours…"
        pending={pending}
        submitVariant={destructive ? 'destructive' : 'default'}
        // Un seul textarea → modale compacte (largeur via `size`, jamais contentClassName).
        size="sm"
      >
        <TextareaField
          control={form.control}
          name="motif"
          label={label}
          required
          rows={rows}
          // Focus d'emblée sur la saisie (et non le bouton « X » de fermeture).
          autoFocus
        />
      </FormDialog>
    </Form>
  )
}
