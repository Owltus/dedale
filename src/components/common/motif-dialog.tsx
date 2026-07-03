import { useState } from 'react'
import { z } from 'zod'
import { fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'

// Motif obligatoire et borné (miroir des garde-fous backend : CHECK
// motif_annulation, p_motif des RPC). Schéma local : la brique commune ne
// dépend d'aucune feature.
const motifSchema = z.object({
  motif: z.string().trim().min(1, 'Le motif est obligatoire').max(2000),
})

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
  const [motif, setMotif] = useState('')
  const [error, setError] = useState<string | undefined>()

  function handleSubmit() {
    const parsed = motifSchema.safeParse({ motif })
    if (!parsed.success) {
      setError(fieldErrors(parsed.error).motif)
      return
    }
    setError(undefined)
    onConfirm(parsed.data.motif)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={() => handleSubmit()}
      submitLabel={confirmLabel}
      pendingLabel="En cours…"
      pending={pending}
      submitVariant={destructive ? 'destructive' : 'default'}
    >
      <TextareaField
        label={label}
        required
        rows={rows}
        value={motif}
        onChange={setMotif}
        error={error}
      />
    </FormDialog>
  )
}
