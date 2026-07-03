import { emptyModeleOperation, modeleOperationSchema } from '../schemas'
import type { ModeleOperationFormValues } from '../schemas'
import {
  useCreateModeleOperation,
  useUpdateModeleOperation,
} from '../mutations'
import type { ModeleOperation } from '../queries'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { resolvePorteeScope } from '@/lib/scope'
import type { LockedScope } from '@/lib/scope'
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
  lockedScope?: LockedScope | null
  /**
   * Création dans une catégorie imposée (navigation par paliers) : catégorie
   * verrouillée → le sélecteur de catégorie est masqué. Ignoré en édition.
   */
  lockedCategorieId?: string | null
}

function initialValues(
  modele: ModeleOperation | null | undefined,
  canEntreprise: boolean,
  lockedScope: LockedScope | null | undefined,
  lockedCategorieId: string | null | undefined,
): ModeleOperationFormValues {
  if (!modele)
    return {
      ...emptyModeleOperation,
      // Portée verrouillée sur le périmètre de la page si fournie ; sinon défaut
      // selon le rôle (un tech ne crée que des modèles d’opération de site).
      portee: resolvePorteeScope({
        portee: emptyModeleOperation.portee,
        // `porteeInitiale` ne dépend pas du site actif (seulement du rôle et du
        // périmètre verrouillé).
        siteId: null,
        canEntreprise,
        lockedScope,
        isEdit: false,
      }).porteeInitiale,
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
  const form = useFormDialog({
    schema: modeleOperationSchema,
    initialValues: () =>
      initialValues(modele, canEntreprise, lockedScope, lockedCategorieId),
    onSubmit: (data) => {
      if (modele)
        return update.mutateAsync({ id: modele.id, values: data, siteId })
      // `createSiteId` = périmètre verrouillé si fourni, sinon site actif.
      const { createSiteId } = resolvePorteeScope({
        portee: data.portee,
        siteId,
        canEntreprise,
        lockedScope,
        isEdit,
      })
      return create.mutateAsync({ values: data, siteId: createSiteId })
    },
    successMessage: isEdit
      ? 'Modèle d’opération modifié'
      : 'Modèle d’opération créé',
    close: () => onOpenChange(false),
  })

  // Image : périmètre = portée du modèle (commun → pool entreprise, sinon site).
  // Téléversement autorisé sur le commun pour les rôles entreprise, sur un site
  // pour tout éditeur (calque du formulaire de modèle d'équipement).
  const { miniatureSite, canUploadMiniature } = resolvePorteeScope({
    portee: form.values.portee,
    siteId,
    canEntreprise,
    lockedScope,
    isEdit,
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEdit ? 'Modifier le modèle d’opération' : 'Nouveau modèle d’opération'
      }
      description="Un modèle d'opérations réutilisable pour composer des gammes."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <IdentiteFields
        nom={{
          value: form.values.nom,
          onChange: (v) => form.set('nom', v),
          error: form.errors.nom,
        }}
        description={{
          value: form.values.description,
          onChange: (v) => form.set('description', v),
          error: form.errors.description,
        }}
        image={{
          value: form.values.miniature_id,
          onChange: (id) => form.set('miniature_id', id),
          targetSiteId: miniatureSite,
          canUpload: canUploadMiniature,
        }}
      />
      <SelectField
        label="Catégorie"
        value={form.values.categorie_id}
        onChange={(v) => form.set('categorie_id', v)}
        error={form.errors.categorie_id}
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
    </FormDialog>
  )
}
