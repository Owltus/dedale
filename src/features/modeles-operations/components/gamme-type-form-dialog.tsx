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
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'

interface CategorieOption {
  id: string
  nom: string
}

interface GammeTypeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modele?: ModeleOperation | null
  categories: CategorieOption[]
  /** Droit de créer/éditer sur le scope entreprise (admin/manager). */
  canEntreprise: boolean
  siteId: string | null
  /**
   * Périmètre (Commun/site) imposé par le contexte. La portée n'est JAMAIS un
   * champ du formulaire : à la création elle vient du sélecteur de la top bar
   * (via `lockedScope`), à l'édition elle reste celle du modèle (inchangée).
   */
  lockedScope?: { portee: 'entreprise' | 'site'; siteId: string | null } | null
  /**
   * Création dans une catégorie imposée (navigation par paliers) : catégorie
   * verrouillée → le sélecteur de catégorie est masqué. Ignoré en édition.
   */
  lockedCategorieId?: string | null
}

function initialValues(
  modele: ModeleOperation | null | undefined,
  canEntreprise: boolean,
  lockedScope: { portee: 'entreprise' | 'site' } | null | undefined,
  lockedCategorieId: string | null | undefined,
): ModeleOperationFormValues {
  if (!modele)
    return {
      ...emptyModeleOperation,
      // Portée verrouillée sur le périmètre de la page si fournie ; sinon défaut
      // selon le rôle (un tech ne crée que des modèles d’opération de site).
      portee: lockedScope
        ? lockedScope.portee
        : canEntreprise
          ? emptyModeleOperation.portee
          : 'site',
      // Catégorie imposée par la navigation (sinon choisie dans le formulaire).
      ...(lockedCategorieId ? { categorie_id: lockedCategorieId } : {}),
    }
  return {
    nom: modele.nom,
    description: modele.description ?? '',
    categorie_id: modele.categorie_id,
    miniature_id: modele.miniature_id,
    portee: modele.site_id === null ? 'entreprise' : 'site',
  }
}

export function GammeTypeFormDialog({
  open,
  onOpenChange,
  modele,
  categories,
  canEntreprise,
  siteId,
  lockedScope,
  lockedCategorieId,
}: GammeTypeFormDialogProps) {
  const isEdit = Boolean(modele)
  const create = useCreateModeleOperation()
  const update = useUpdateModeleOperation()
  const [values, setValues] = useState<ModeleOperationFormValues>(() =>
    initialValues(modele, canEntreprise, lockedScope, lockedCategorieId),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending
  // Création dans une catégorie imposée → le sélecteur de catégorie est masqué.
  const hideCategorie = !isEdit && lockedCategorieId != null
  // Image : périmètre = portée du modèle (commun → pool entreprise, sinon site).
  // Téléversement autorisé sur le commun pour les rôles entreprise, sur un site
  // pour tout éditeur (calque du formulaire de modèle d'équipement).
  const miniatureSite = values.portee === 'entreprise' ? null : siteId
  const canUploadMiniature = miniatureSite === null ? canEntreprise : true

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
        toast.success('Modèle d’opération modifié')
      } else {
        await create.mutateAsync({
          values: parsed.data,
          siteId: lockedScope ? lockedScope.siteId : siteId,
        })
        toast.success('Modèle d’opération créé')
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
      title={
        isEdit ? 'Modifier le modèle d’opération' : 'Nouveau modèle d’opération'
      }
      description="Un modèle d'opérations réutilisable pour composer des gammes."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      <IdentiteFields
        nom={{
          value: values.nom,
          onChange: (v) => set('nom', v),
          error: errors.nom,
        }}
        description={{
          value: values.description,
          onChange: (v) => set('description', v),
          error: errors.description,
        }}
        image={{
          value: values.miniature_id,
          onChange: (id) => set('miniature_id', id),
          targetSiteId: miniatureSite,
          canUpload: canUploadMiniature,
        }}
      />
      {!hideCategorie && (
        <SelectField
          label="Catégorie"
          value={values.categorie_id}
          onChange={(v) => set('categorie_id', v)}
          error={errors.categorie_id}
          required
        >
          <option value="" disabled>
            — Choisir une catégorie —
          </option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </SelectField>
      )}
    </FormDialog>
  )
}
