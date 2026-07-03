import { emptyPrestataire, prestataireSchema } from '../schemas'
import type { PrestataireFormValues } from '../schemas'
import { useCreatePrestataire, useUpdatePrestataire } from '../mutations'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
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
  const form = useFormDialog({
    schema: prestataireSchema,
    initialValues: () => initialValues(prestataire),
    onSubmit: (data) =>
      prestataire
        ? update.mutateAsync({ id: prestataire.id, values: data })
        : create.mutateAsync(data),
    successMessage: isEdit ? 'Prestataire modifié' : 'Prestataire créé',
    close: () => onOpenChange(false),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le prestataire' : 'Nouveau prestataire'}
      description="Nom, description et image du prestataire."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <IdentiteFields
        nom={{
          value: form.values.libelle,
          onChange: (v) => form.set('libelle', v),
          error: form.errors.libelle,
        }}
        description={{
          value: form.values.commentaires,
          onChange: (v) => form.set('commentaires', v),
          error: form.errors.commentaires,
        }}
        image={{
          value: form.values.miniature_id,
          onChange: (id) =>
            form.setValues((v) => ({ ...v, miniature_id: id })),
          // Image scopée au SITE ACTIF (décision PO) : un technicien alimente le
          // pool de SON site, jamais le pool commun entreprise. La fiche prestataire
          // est de toute façon bornée au site actif (contrats/docs idem). Revers
          // assumé : l'image n'est visible que depuis ce site (RLS). Le trigger
          // backend `check_miniature_prestataire` autorise désormais ce scope.
          targetSiteId: siteId,
          canUpload: true,
        }}
      />
    </FormDialog>
  )
}
