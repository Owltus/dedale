import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyPrestataire, prestataireSchema } from '../schemas'
import type { PrestataireFormValues } from '../schemas'
import { useCreatePrestataire, useUpdatePrestataire } from '../mutations'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import type { Database } from '@/lib/database.types'

type Prestataire = Database['public']['Tables']['prestataires']['Row']

interface PrestataireFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Site actif : périmètre d'upload de l'image (pool du site, pas le commun). */
  siteId: string
  prestataire?: Prestataire | null
}

function initialValues(
  prestataire: Prestataire | null | undefined,
): PrestataireFormValues {
  if (!prestataire) return emptyPrestataire
  return {
    libelle: prestataire.libelle,
    commentaires: prestataire.commentaires ?? '',
    miniature_id: prestataire.miniature_id ?? null,
  }
}

export function PrestataireFormDialog({
  open,
  onOpenChange,
  siteId,
  prestataire,
}: PrestataireFormDialogProps) {
  const isEdit = Boolean(prestataire)
  const create = useCreatePrestataire()
  const update = useUpdatePrestataire()
  const form = useForm<PrestataireFormValues>({
    resolver: zodResolver(prestataireSchema),
    defaultValues: initialValues(prestataire),
  })
  const submit = useSubmitDialog<PrestataireFormValues>({
    onSubmit: (data) =>
      prestataire
        ? update.mutateAsync({ id: prestataire.id, values: data })
        : create.mutateAsync(data),
    successMessage: isEdit ? 'Prestataire modifié' : 'Prestataire créé',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le prestataire' : 'Nouveau prestataire'}
        description="Nom, description et image du prestataire."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <IdentiteFields
          control={form.control}
          nomName="libelle"
          descriptionName="commentaires"
          // Image scopée au SITE ACTIF (décision PO) : un technicien alimente le
          // pool de SON site, jamais le pool commun entreprise. La fiche prestataire
          // est de toute façon bornée au site actif (contrats/docs idem). Revers
          // assumé : l'image n'est visible que depuis ce site (RLS). Le trigger
          // backend `check_miniature_prestataire` autorise désormais ce scope.
          image={{ name: 'miniature_id', targetSiteId: siteId, canUpload: true }}
        />
      </FormDialog>
    </Form>
  )
}
