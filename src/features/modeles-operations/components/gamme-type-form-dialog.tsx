import { useState } from 'react'
import { toast } from 'sonner'
import { emptyModeleOperation, modeleOperationSchema } from '../schemas'
import type { ModeleOperationFormValues } from '../schemas'
import {
  useCreateModeleOperation,
  useUpdateModeleOperation,
} from '../mutations'
import type { ModeleOperation } from '../queries'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { TextareaField } from '@/components/common/textarea-field'
import { SelectField } from '@/components/common/select-field'

interface GammeTypeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modele?: ModeleOperation | null
  /** Droit de créer/éditer sur le scope entreprise (admin/manager). */
  canEntreprise: boolean
  siteId: string | null
  siteName: string | null
  /**
   * Création depuis le + de la page : portée VERROUILLÉE sur le périmètre choisi
   * (le sélecteur de portée est alors masqué). Ignoré en édition.
   */
  lockedScope?: { portee: 'entreprise' | 'site'; siteId: string | null } | null
}

function initialValues(
  modele: ModeleOperation | null | undefined,
  canEntreprise: boolean,
  lockedScope: { portee: 'entreprise' | 'site' } | null | undefined,
): ModeleOperationFormValues {
  if (!modele)
    return {
      ...emptyModeleOperation,
      // Portée verrouillée sur le périmètre de la page si fournie ; sinon défaut
      // selon le rôle (un tech ne crée que des gammes-types de site).
      portee: lockedScope
        ? lockedScope.portee
        : canEntreprise
          ? emptyModeleOperation.portee
          : 'site',
    }
  return {
    nom: modele.nom,
    description: modele.description ?? '',
    portee: modele.site_id === null ? 'entreprise' : 'site',
  }
}

export function GammeTypeFormDialog({
  open,
  onOpenChange,
  modele,
  canEntreprise,
  siteId,
  siteName,
  lockedScope,
}: GammeTypeFormDialogProps) {
  const isEdit = Boolean(modele)
  const create = useCreateModeleOperation()
  const update = useUpdateModeleOperation()
  const [values, setValues] = useState<ModeleOperationFormValues>(() =>
    initialValues(modele, canEntreprise, lockedScope),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending
  const showEntreprise = canEntreprise || values.portee === 'entreprise'
  // Création depuis le + : la portée vient du périmètre de la page → masquée.
  const hidePortee = !isEdit && lockedScope != null

  function set<K extends keyof ModeleOperationFormValues>(
    key: K,
    value: ModeleOperationFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = modeleOperationSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (modele) {
        await update.mutateAsync({ id: modele.id, values: parsed.data, siteId })
        toast.success('Gamme-type modifiée')
      } else {
        await create.mutateAsync({
          values: parsed.data,
          siteId: lockedScope ? lockedScope.siteId : siteId,
        })
        toast.success('Gamme-type créée')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier la gamme-type' : 'Nouvelle gamme-type'}
      description="Un modèle d'opérations réutilisable pour composer des gammes."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <TextField
        label="Nom"
        value={values.nom}
        onChange={(v) => set('nom', v)}
        error={errors.nom}
        required
      />
      {!hidePortee && (
        <SelectField
          label="Portée"
          value={values.portee}
          onChange={(v) =>
            set('portee', v as ModeleOperationFormValues['portee'])
          }
          error={errors.portee}
          required
        >
          {showEntreprise && <option value="entreprise">Commun</option>}
          {siteId && <option value="site">{siteName ?? 'Site actif'}</option>}
        </SelectField>
      )}
      <TextareaField
        label="Description"
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
    </FormDialog>
  )
}
