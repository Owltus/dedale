import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { emptyModeleDi, modeleDiSchema } from '../schemas'
import type { ModeleDiFormValues } from '../schemas'
import { useCreateModeleDi, useUpdateModeleDi } from '../mutations'
import type { ModeleDi } from '../queries'
import { useAuth } from '@/auth'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { resolvePorteeScope, type LockedScope } from '@/lib/scope'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import { RadioField } from '@/components/common/fields/radio-field'
import { PorteeField } from '@/components/common/fields/portee-field'

interface ModeleDiFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modele?: ModeleDi | null
  /** Droit de créer/éditer sur le scope entreprise (admin/manager). */
  canEntreprise: boolean
  /** Site servant d'option « Site » (création) ou site du modèle édité. */
  siteId: string | null
  siteName: string | null
  /**
   * Création depuis le + de la page : portée VERROUILLÉE sur le périmètre choisi
   * (le sélecteur de portée est alors masqué). Ignoré en édition.
   */
  lockedScope?: LockedScope | null
}

function initialValues(
  modele: ModeleDi | null | undefined,
  canEntreprise: boolean,
  lockedScope: LockedScope | null | undefined,
  siteId: string | null,
): ModeleDiFormValues {
  if (!modele)
    return {
      ...emptyModeleDi,
      // Portée verrouillée sur le périmètre de la page si fournie ; sinon défaut
      // selon le rôle (un tech ne crée que des modèles de site).
      portee: resolvePorteeScope({
        portee: emptyModeleDi.portee,
        siteId,
        canEntreprise,
        lockedScope,
        isEdit: false,
      }).porteeInitiale,
    }
  return {
    libelle: modele.libelle,
    constat_modele: modele.constat_modele,
    miniature_id: modele.miniature_id,
    etat: modele.est_actif ? 'actif' : 'inactif',
    portee: modele.site_id === null ? 'entreprise' : 'site',
  }
}

export function ModeleDiFormDialog({
  open,
  onOpenChange,
  modele,
  canEntreprise,
  siteId,
  siteName,
  lockedScope,
}: ModeleDiFormDialogProps) {
  const isEdit = Boolean(modele)
  const { session } = useAuth()
  const create = useCreateModeleDi()
  const update = useUpdateModeleDi()

  const form = useForm<ModeleDiFormValues>({
    resolver: zodResolver(modeleDiSchema),
    defaultValues: initialValues(modele, canEntreprise, lockedScope, siteId),
  })

  // Image : périmètre = portée du modèle (commun → pool entreprise, sinon site).
  // Téléversement autorisé sur le commun pour les rôles entreprise, sur un site
  // pour tout éditeur (calque du formulaire de modèle d'équipement).
  const portee = useWatch({ control: form.control, name: 'portee' })
  const {
    showEntreprise,
    hidePortee,
    miniatureSite,
    canUploadMiniature,
    createSiteId,
  } = resolvePorteeScope({ portee, siteId, canEntreprise, lockedScope, isEdit })

  const submit = useSubmitDialog<ModeleDiFormValues>({
    onSubmit: async (data) => {
      if (modele) {
        // Édition : la portée (`site_id`) est immuable → non transmise.
        await update.mutateAsync({ id: modele.id, values: data })
        return
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      await create.mutateAsync({
        values: data,
        siteId: createSiteId,
        createdBy: session.user.id,
      })
    },
    successMessage: isEdit ? 'Modèle modifié' : 'Modèle créé',
    close: () => onOpenChange(false),
  })

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier le modèle de DI' : 'Nouveau modèle de DI'}
        description="Un constat pré-rédigé pour accélérer la saisie des demandes d’intervention."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        {/* Exception : ce modèle n'a pas de « description » — c'est le CONSTAT qui en
            tient lieu. On le place donc comme description du bloc identité, pour que
            l'image s'aligne sur Libellé + Constat comme dans les autres modals. */}
        <IdentiteFields
          control={form.control}
          nomName="libelle"
          nomLabel="Libellé"
          descriptionName="constat_modele"
          descriptionLabel="Constat (modèle)"
          descriptionRequired
          image={{
            name: 'miniature_id',
            targetSiteId: miniatureSite,
            canUpload: canUploadMiniature,
          }}
        />
        <PorteeField
          control={form.control}
          name="portee"
          showEntreprise={showEntreprise}
          siteId={siteId}
          siteName={siteName}
          // Immuable après création (trigger backend) → lecture seule en édition.
          disabled={isEdit}
          hidden={hidePortee}
        />
        <RadioField
          control={form.control}
          name="etat"
          label="État"
          options={[
            {
              value: 'actif',
              label: 'Actif',
              description: 'Proposé dans la liste des problèmes courants.',
            },
            {
              value: 'inactif',
              label: 'Masqué',
              description: 'Retiré des choix, sans suppression.',
            },
          ]}
        />
      </FormDialog>
    </Form>
  )
}
