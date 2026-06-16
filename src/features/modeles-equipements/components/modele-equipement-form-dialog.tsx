import { useState } from 'react'
import { toast } from 'sonner'
import { emptyModeleEquipement, modeleEquipementSchema } from '../schemas'
import type { ModeleEquipementFormValues } from '../schemas'
import {
  useCreateModeleEquipement,
  useUpdateModeleEquipement,
} from '../mutations'
import type { ModeleEquipement } from '../queries'
import { parseChamps, prepareChamps } from '@/lib/champs'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'

interface CategorieOption {
  id: string
  nom: string
}

interface ModeleEquipementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  modele?: ModeleEquipement | null
  categories: CategorieOption[]
  /** Droit de créer/éditer sur le scope entreprise (admin/manager). */
  canEntreprise: boolean
  siteId: string | null
  siteName: string | null
  /**
   * Création depuis le + de la page : portée VERROUILLÉE sur le périmètre choisi
   * (le sélecteur de portée est alors masqué). Ignoré en édition.
   */
  lockedScope?: { portee: 'entreprise' | 'site'; siteId: string | null } | null
  /**
   * Création dans une catégorie imposée (navigation par paliers) : catégorie
   * verrouillée → le sélecteur de catégorie est masqué. Ignoré en édition.
   */
  lockedCategorieId?: string | null
  /**
   * Création MINIMALE : ne garde que Nom + Description (État et caractéristiques
   * masqués, ajoutables ensuite à l'édition). Ignoré en édition.
   */
  minimal?: boolean
}

function initialValues(
  modele: ModeleEquipement | null | undefined,
  canEntreprise: boolean,
  lockedScope: { portee: 'entreprise' | 'site' } | null | undefined,
  lockedCategorieId: string | null | undefined,
): ModeleEquipementFormValues {
  if (!modele)
    return {
      ...emptyModeleEquipement,
      // Portée verrouillée sur le périmètre de la page si fournie ; sinon défaut
      // selon le rôle (un tech ne crée que des modèles de site).
      portee: lockedScope
        ? lockedScope.portee
        : canEntreprise
          ? emptyModeleEquipement.portee
          : 'site',
      // Catégorie imposée par la navigation (sinon choisie dans le formulaire).
      ...(lockedCategorieId ? { categorie_id: lockedCategorieId } : {}),
    }
  return {
    nom: modele.nom,
    description: modele.description ?? '',
    categorie_id: modele.categorie_id,
    portee: modele.site_id === null ? 'entreprise' : 'site',
    etat: modele.est_actif ? 'actif' : 'inactif',
    miniature_id: modele.miniature_id,
    specifications: parseChamps(modele.specifications),
  }
}

export function ModeleEquipementFormDialog({
  open,
  onOpenChange,
  modele,
  categories,
  canEntreprise,
  siteId,
  siteName,
  lockedScope,
  lockedCategorieId,
  minimal,
}: ModeleEquipementFormDialogProps) {
  const isEdit = Boolean(modele)
  const create = useCreateModeleEquipement()
  const update = useUpdateModeleEquipement()
  const [values, setValues] = useState<ModeleEquipementFormValues>(() =>
    initialValues(modele, canEntreprise, lockedScope, lockedCategorieId),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending
  const showEntreprise = canEntreprise || values.portee === 'entreprise'
  // Catégorie / Portée : VISIBLES et éditables en création ET modification (mêmes
  // champs des deux côtés). À la création, leur valeur par défaut vient du contexte
  // (catégorie du drill, périmètre du sélecteur de site).
  // Mode minimal (optionnel) : masque l'État. Les caractéristiques détaillées se
  // gèrent de toute façon sur la PAGE de détail du modèle.
  const compact = minimal === true
  // Image : périmètre = portée du modèle (commun → pool entreprise, sinon site).
  // Téléversement autorisé sur le commun pour les rôles entreprise, sur un site
  // pour tout éditeur (calque du formulaire de catégorie).
  const miniatureSite = values.portee === 'entreprise' ? null : siteId
  const canUploadMiniature = miniatureSite === null ? canEntreprise : true

  function set<K extends keyof ModeleEquipementFormValues>(
    key: K,
    value: ModeleEquipementFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    // Nettoyage + validation fine des champs, mutualisés avec la page de détail.
    const prepared = prepareChamps(values.specifications)
    if (!prepared.ok) {
      setErrors({ specifications: prepared.error })
      return
    }
    const parsed = modeleEquipementSchema.safeParse({
      ...values,
      specifications: prepared.champs,
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (modele) {
        await update.mutateAsync({ id: modele.id, values: parsed.data, siteId })
        toast.success('Modèle modifié')
      } else {
        await create.mutateAsync({
          values: parsed.data,
          siteId: lockedScope ? lockedScope.siteId : siteId,
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
      title={
        isEdit ? 'Modifier le modèle d’équipement' : 'Nouveau modèle d’équipement'
      }
      description="Un gabarit réutilisable pour instancier rapidement des équipements."
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <SelectField
          label="Portée"
          value={values.portee}
          onChange={(v) =>
            set('portee', v as ModeleEquipementFormValues['portee'])
          }
          error={errors.portee}
          required
        >
          {showEntreprise && <option value="entreprise">Commun</option>}
          {siteId && <option value="site">{siteName ?? 'Site actif'}</option>}
        </SelectField>
      </div>
      {!compact && (
        <SelectField
          label="État"
          value={values.etat}
          onChange={(v) => set('etat', v as ModeleEquipementFormValues['etat'])}
        >
          <option value="actif">Actif</option>
          <option value="inactif">Masqué</option>
        </SelectField>
      )}
    </FormDialog>
  )
}
