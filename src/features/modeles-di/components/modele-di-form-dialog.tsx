import { emptyModeleDi, modeleDiSchema } from '../schemas'
import type { ModeleDiFormValues } from '../schemas'
import { useCreateModeleDi, useUpdateModeleDi } from '../mutations'
import type { ModeleDi } from '../queries'
import { useAuth } from '@/auth'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { resolvePorteeScope, type LockedScope } from '@/lib/scope'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'
import { PorteeField } from '@/components/common/portee-field'

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

  const form = useFormDialog({
    schema: modeleDiSchema,
    initialValues: () => initialValues(modele, canEntreprise, lockedScope, siteId),
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

  // Image : périmètre = portée du modèle (commun → pool entreprise, sinon site).
  // Téléversement autorisé sur le commun pour les rôles entreprise, sur un site
  // pour tout éditeur (calque du formulaire de modèle d'équipement).
  const { showEntreprise, hidePortee, miniatureSite, canUploadMiniature, createSiteId } =
    resolvePorteeScope({
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
      title={isEdit ? 'Modifier le modèle de DI' : 'Nouveau modèle de DI'}
      description="Un constat pré-rédigé pour accélérer la saisie des demandes d'intervention."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      {/* Exception : ce modèle n'a pas de « description » — c'est le CONSTAT qui en
          tient lieu. On le place donc comme description du bloc identité, pour que
          l'image s'aligne sur Libellé + Constat comme dans les autres modals. */}
      <IdentiteFields
        nom={{
          label: 'Libellé',
          value: form.values.libelle,
          onChange: (v) => form.set('libelle', v),
          error: form.errors.libelle,
        }}
        description={{
          label: 'Constat (modèle)',
          value: form.values.constat_modele,
          onChange: (v) => form.set('constat_modele', v),
          error: form.errors.constat_modele,
          required: true,
        }}
        image={{
          value: form.values.miniature_id,
          onChange: (id) => form.set('miniature_id', id),
          targetSiteId: miniatureSite,
          canUpload: canUploadMiniature,
        }}
      />
      <PorteeField
        value={form.values.portee}
        onChange={(v) => form.set('portee', v)}
        error={form.errors.portee}
        showEntreprise={showEntreprise}
        siteId={siteId}
        siteName={siteName}
        // Immuable après création (trigger backend) → lecture seule en édition.
        disabled={isEdit}
        hidden={hidePortee}
      />
      <SelectField
        label="État"
        value={form.values.etat}
        onChange={(v) => form.set('etat', v as ModeleDiFormValues['etat'])}
      >
        <option value="actif">Actif</option>
        <option value="inactif">Masqué</option>
      </SelectField>
    </FormDialog>
  )
}
