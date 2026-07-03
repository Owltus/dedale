import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyModeleOperation, modeleOperationSchema } from '../schemas'
import type { ModeleOperationFormValues } from '../schemas'
import {
  useCreateModeleOperation,
  useUpdateModeleOperation,
} from '../mutations'
import type { ModeleOperation } from '../queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { resolvePorteeScope } from '@/lib/scope'
import type { LockedScope } from '@/lib/scope'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import { SelectField } from '@/components/common/fields/select-field'

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
  const form = useForm<ModeleOperationFormValues>({
    resolver: zodResolver(modeleOperationSchema),
    defaultValues: initialValues(
      modele,
      canEntreprise,
      lockedScope,
      lockedCategorieId,
    ),
  })
  const submit = useSubmitDialog<ModeleOperationFormValues>({
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
  const portee = useWatch({ control: form.control, name: 'portee' })
  const { miniatureSite, canUploadMiniature } = resolvePorteeScope({
    portee,
    siteId,
    canEntreprise,
    lockedScope,
    isEdit,
  })

  const categorieOptions = [
    { value: '', label: '— Choisir une catégorie —' },
    ...categories.map((c) => ({ value: c.id, label: c.nom })),
  ]

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={
          isEdit ? 'Modifier le modèle d’opération' : 'Nouveau modèle d’opération'
        }
        description="Un modèle d’opérations réutilisable pour composer des gammes."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <IdentiteFields
          control={form.control}
          nomName="nom"
          descriptionName="description"
          image={{
            name: 'miniature_id',
            targetSiteId: miniatureSite,
            canUpload: canUploadMiniature,
          }}
        />
        <SelectField
          control={form.control}
          name="categorie_id"
          label="Catégorie"
          required
          options={categorieOptions}
        />
      </FormDialog>
    </Form>
  )
}
