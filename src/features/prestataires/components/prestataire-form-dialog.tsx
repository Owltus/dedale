import { useState } from 'react'
import { toast } from 'sonner'
import { emptyPrestataire, prestataireSchema } from '../schemas'
import type { PrestataireFormValues } from '../schemas'
import { useCreatePrestataire, useUpdatePrestataire } from '../mutations'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
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
  const [values, setValues] = useState<PrestataireFormValues>(() =>
    initialValues(prestataire),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: 'libelle' | 'commentaires', value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = prestataireSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (prestataire) {
        await update.mutateAsync({ id: prestataire.id, values: parsed.data })
        toast.success('Prestataire modifié')
      } else {
        await create.mutateAsync(parsed.data)
        toast.success('Prestataire créé')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier le prestataire' : 'Nouveau prestataire'}
      description="Nom, description et image du prestataire."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <IdentiteFields
        nom={{
          value: values.libelle,
          onChange: (v) => set('libelle', v),
          error: errors.libelle,
        }}
        description={{
          value: values.commentaires,
          onChange: (v) => set('commentaires', v),
          error: errors.commentaires,
        }}
        image={{
          value: values.miniature_id,
          onChange: (id) => setValues((v) => ({ ...v, miniature_id: id })),
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
