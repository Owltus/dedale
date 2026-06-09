import { useState } from 'react'
import { toast } from 'sonner'
import { CATEGORIE_SCOPES, categorieSchema, emptyCategorie } from '../schemas'
import type { CategorieFormValues } from '../schemas'
import { useCreateCategorie, useUpdateCategorie } from '../mutations'
import type { Categorie } from '../queries'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { TextareaField } from '@/components/common/textarea-field'
import { SelectField } from '@/components/common/select-field'

interface Preset {
  parent_id?: string
  scope?: CategorieFormValues['scope']
  portee?: CategorieFormValues['portee']
}

interface CategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  categorie?: Categorie | null
  /** Présélection à la création (ex. ajout d'une sous-catégorie). */
  preset?: Preset
  /** Toutes les catégories visibles (pour le choix du parent). */
  categories: Categorie[]
  /** Droit de créer/éditer sur le scope entreprise (admin/manager). */
  canEntreprise: boolean
  siteId: string | null
  siteName: string | null
}

function initialValues(
  categorie: Categorie | null | undefined,
  preset: Preset | undefined,
  canEntreprise: boolean,
): CategorieFormValues {
  if (categorie) {
    return {
      nom: categorie.nom,
      scope: categorie.scope,
      description: categorie.description ?? '',
      parent_id: categorie.parent_id ?? '',
      portee: categorie.site_id === null ? 'entreprise' : 'site',
      etat: categorie.est_actif ? 'actif' : 'inactif',
    }
  }
  return {
    ...emptyCategorie,
    // Un tech ne crée que des catégories de site.
    portee: canEntreprise ? emptyCategorie.portee : 'site',
    ...(preset?.parent_id ? { parent_id: preset.parent_id } : {}),
    ...(preset?.scope ? { scope: preset.scope } : {}),
    ...(preset?.portee ? { portee: preset.portee } : {}),
  }
}

// Catégorie éditée + toute sa descendance : interdites comme parent (un cycle
// serait de toute façon refusé côté backend).
function descendantIds(rootId: string, categories: Categorie[]): Set<string> {
  const childrenByParent = new Map<string, Categorie[]>()
  for (const c of categories) {
    if (!c.parent_id) continue
    const list = childrenByParent.get(c.parent_id) ?? []
    list.push(c)
    childrenByParent.set(c.parent_id, list)
  }
  const excluded = new Set<string>([rootId])
  const stack: string[] = [rootId]
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    for (const child of childrenByParent.get(id) ?? []) {
      if (!excluded.has(child.id)) {
        excluded.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return excluded
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  categorie,
  preset,
  categories,
  canEntreprise,
  siteId,
  siteName,
}: CategoryFormDialogProps) {
  const isEdit = Boolean(categorie)
  const create = useCreateCategorie()
  const update = useUpdateCategorie()
  const [values, setValues] = useState<CategorieFormValues>(() =>
    initialValues(categorie, preset, canEntreprise),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  const excluded = categorie
    ? descendantIds(categorie.id, categories)
    : new Set<string>()
  const parentOptions = categories.filter((c) => !excluded.has(c.id))
  // Option Entreprise visible si on en a le droit, ou si la valeur courante l'est
  // déjà (lecture d'une entrée entreprise existante).
  const showEntreprise = canEntreprise || values.portee === 'entreprise'

  function set<K extends keyof CategorieFormValues>(
    key: K,
    value: CategorieFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = categorieSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (categorie) {
        await update.mutateAsync({
          id: categorie.id,
          values: parsed.data,
          siteId,
        })
        toast.success('Catégorie modifiée')
      } else {
        await create.mutateAsync({ values: parsed.data, siteId })
        toast.success('Catégorie créée')
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
      title={isEdit ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      description="Un domaine est une catégorie racine ; une famille est rattachée à un parent."
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
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Type"
          value={values.scope}
          onChange={(v) => set('scope', v as CategorieFormValues['scope'])}
          error={errors.scope}
          required
        >
          {CATEGORIE_SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Portée"
          value={values.portee}
          onChange={(v) => set('portee', v as CategorieFormValues['portee'])}
          error={errors.portee}
          required
        >
          {showEntreprise && <option value="entreprise">Commun</option>}
          {siteId && <option value="site">{siteName ?? 'Site actif'}</option>}
        </SelectField>
      </div>
      <SelectField
        label="Parent"
        value={values.parent_id}
        onChange={(v) => set('parent_id', v)}
        error={errors.parent_id}
      >
        <option value="">— Aucun (domaine racine) —</option>
        {parentOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
            {c.site_id === null ? ' (entreprise)' : ''}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="État"
        value={values.etat}
        onChange={(v) => set('etat', v as CategorieFormValues['etat'])}
      >
        <option value="actif">Actif</option>
        <option value="inactif">Masqué</option>
      </SelectField>
      <TextareaField
        label="Description"
        value={values.description}
        onChange={(v) => set('description', v)}
        error={errors.description}
      />
    </FormDialog>
  )
}
