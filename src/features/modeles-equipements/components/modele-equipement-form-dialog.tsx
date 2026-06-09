import { useState } from 'react'
import { toast } from 'sonner'
import { emptyModeleEquipement, modeleEquipementSchema } from '../schemas'
import type { ModeleEquipementFormValues } from '../schemas'
import {
  useCreateModeleEquipement,
  useUpdateModeleEquipement,
} from '../mutations'
import type { ModeleEquipement } from '../queries'
import { SpecificationsEditor } from './specifications-editor'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { TextareaField } from '@/components/common/textarea-field'
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

// Représentation texte d'une valeur de caractéristique (primitive attendue ;
// un objet/tableau éventuel est sérialisé pour rester éditable).
function specValueToString(valeur: unknown): string {
  if (valeur == null) return ''
  if (typeof valeur === 'object') return JSON.stringify(valeur)
  if (typeof valeur === 'string') return valeur
  if (typeof valeur === 'number' || typeof valeur === 'boolean') {
    return String(valeur)
  }
  return ''
}

// Convertit l'objet JSON `specifications` en lignes éditables.
function specsToLines(
  specifications: ModeleEquipement['specifications'],
): ModeleEquipementFormValues['specifications'] {
  if (
    specifications &&
    typeof specifications === 'object' &&
    !Array.isArray(specifications)
  ) {
    return Object.entries(specifications).map(([cle, valeur]) => ({
      cle,
      valeur: specValueToString(valeur),
    }))
  }
  return []
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
    categorie_id: modele.categorie_id ?? '',
    portee: modele.site_id === null ? 'entreprise' : 'site',
    etat: modele.est_actif ? 'actif' : 'inactif',
    specifications: specsToLines(modele.specifications),
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
  // Création depuis le + : portée et/ou catégorie viennent du contexte → masquées.
  const hidePortee = !isEdit && lockedScope != null
  const hideCategorie = !isEdit && lockedCategorieId != null
  // Mode minimal (création depuis la navigation) : juste Nom + Description.
  const compact = minimal === true && !isEdit

  function set<K extends keyof ModeleEquipementFormValues>(
    key: K,
    value: ModeleEquipementFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = modeleEquipementSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    // Validation fine des caractéristiques : clés non vides et uniques.
    const lines = values.specifications.filter(
      (s) => s.cle.trim() !== '' || s.valeur.trim() !== '',
    )
    const keys = lines.map((s) => s.cle.trim())
    if (keys.some((k) => k === '')) {
      setErrors({
        specifications: 'Chaque caractéristique doit avoir une clé.',
      })
      return
    }
    if (new Set(keys).size !== keys.length) {
      setErrors({ specifications: 'Les clés doivent être uniques.' })
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
      title={isEdit ? 'Modifier le modèle' : "Nouveau modèle d'équipement"}
      description="Un gabarit réutilisable pour instancier rapidement des équipements."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
      contentClassName="max-h-[90vh] overflow-y-auto"
    >
      <TextField
        label="Nom"
        value={values.nom}
        onChange={(v) => set('nom', v)}
        error={errors.nom}
        required
      />
      {(!hideCategorie || !hidePortee) && (
        <div
          className={
            !hideCategorie && !hidePortee ? 'grid grid-cols-2 gap-4' : undefined
          }
        >
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
          {!hidePortee && (
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
              {siteId && (
                <option value="site">{siteName ?? 'Site actif'}</option>
              )}
            </SelectField>
          )}
        </div>
      )}
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
      <TextareaField
        label="Description"
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
      {!compact && (
        <SpecificationsEditor
          value={values.specifications}
          onChange={(lines) => set('specifications', lines)}
          error={errors.specifications}
        />
      )}
    </FormDialog>
  )
}
