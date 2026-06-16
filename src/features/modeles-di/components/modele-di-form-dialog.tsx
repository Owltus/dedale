import { useState } from 'react'
import { toast } from 'sonner'
import { emptyModeleDi, modeleDiSchema } from '../schemas'
import type { ModeleDiFormValues } from '../schemas'
import { useCreateModeleDi, useUpdateModeleDi } from '../mutations'
import type { ModeleDi } from '../queries'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { DescriptionField } from '@/components/common/description-field'
import { SelectField } from '@/components/common/select-field'

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
  lockedScope?: { portee: 'entreprise' | 'site'; siteId: string | null } | null
}

function initialValues(
  modele: ModeleDi | null | undefined,
  canEntreprise: boolean,
  lockedScope: { portee: 'entreprise' | 'site' } | null | undefined,
): ModeleDiFormValues {
  if (!modele)
    return {
      ...emptyModeleDi,
      // Portée verrouillée sur le périmètre de la page si fournie ; sinon défaut
      // selon le rôle (un tech ne crée que des modèles de site).
      portee: lockedScope
        ? lockedScope.portee
        : canEntreprise
          ? emptyModeleDi.portee
          : 'site',
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
  const [values, setValues] = useState<ModeleDiFormValues>(() =>
    initialValues(modele, canEntreprise, lockedScope),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending
  const showEntreprise = canEntreprise || values.portee === 'entreprise'
  // Création depuis le + : la portée vient du périmètre de la page → masquée.
  const hidePortee = !isEdit && lockedScope != null
  // Image : périmètre = portée du modèle (commun → pool entreprise, sinon site).
  // Téléversement autorisé sur le commun pour les rôles entreprise, sur un site
  // pour tout éditeur (calque du formulaire de modèle d'équipement).
  const miniatureSite = values.portee === 'entreprise' ? null : siteId
  const canUploadMiniature = miniatureSite === null ? canEntreprise : true

  function set<K extends keyof ModeleDiFormValues>(
    key: K,
    value: ModeleDiFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = modeleDiSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (modele) {
        // Édition : la portée (`site_id`) est immuable → non transmise.
        await update.mutateAsync({ id: modele.id, values: parsed.data })
        toast.success('Modèle modifié')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          values: parsed.data,
          siteId: lockedScope ? lockedScope.siteId : siteId,
          createdBy: session.user.id,
        })
        toast.success('Modèle créé')
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
      title={isEdit ? 'Modifier le modèle de DI' : 'Nouveau modèle de DI'}
      description="Un constat pré-rédigé pour accélérer la saisie des demandes d'intervention."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
    >
      {/* Bloc identité : image + libellé. Pas de « description » ici — le corps
          du modèle est le Constat (champ requis, ci-dessous). */}
      <IdentiteFields
        nom={{
          label: 'Libellé',
          value: values.libelle,
          onChange: (v) => set('libelle', v),
          error: errors.libelle,
        }}
        image={{
          value: values.miniature_id,
          onChange: (id) => set('miniature_id', id),
          targetSiteId: miniatureSite,
          canUpload: canUploadMiniature,
        }}
      />
      {!hidePortee && (
        <SelectField
          label="Portée"
          value={values.portee}
          onChange={(v) => set('portee', v as ModeleDiFormValues['portee'])}
          error={errors.portee}
          // Immuable après création (trigger backend) → lecture seule en édition.
          disabled={isEdit}
          required
        >
          {showEntreprise && <option value="entreprise">Commun</option>}
          {siteId && <option value="site">{siteName ?? 'Site actif'}</option>}
        </SelectField>
      )}
      <DescriptionField
        label="Constat (modèle)"
        value={values.constat_modele}
        onChange={(v) => set('constat_modele', v)}
        error={errors.constat_modele}
        required
      />
      <SelectField
        label="État"
        value={values.etat}
        onChange={(v) => set('etat', v as ModeleDiFormValues['etat'])}
      >
        <option value="actif">Actif</option>
        <option value="inactif">Masqué</option>
      </SelectField>
    </FormDialog>
  )
}
