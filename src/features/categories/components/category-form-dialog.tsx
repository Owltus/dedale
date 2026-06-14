import { useState } from 'react'
import { toast } from 'sonner'
import { CATEGORIE_SCOPES, categorieSchema, emptyCategorie } from '../schemas'
import type { CategorieFormValues } from '../schemas'
import { useCreateCategorie, useUpdateCategorie } from '../mutations'
import type { Categorie } from '../queries'
import { errorMessage, fieldErrors, pgCode } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { TextareaField } from '@/components/common/textarea-field'
import { SelectField } from '@/components/common/select-field'
import { MiniatureField } from '@/features/miniatures/components/miniature-field'

/**
 * Traduit les erreurs Postgres de création/édition d'une catégorie (dialog
 * partagé entre les onglets Gammes et Équipement). Évite tout message technique
 * brut : repli sur `errorMessage` pour le reste.
 */
function categorieErrorMessage(e: unknown): string {
  const code = pgCode(e)
  // unique_violation : index `uq_categories_nom` (nom déjà pris à cet emplacement).
  if (code === '23505') {
    return 'Une catégorie portant ce nom existe déjà à cet emplacement.'
  }
  // insufficient_privilege : RLS (hors scope d'écriture).
  if (code === '42501') {
    return 'Action non autorisée : vous n’avez pas les droits sur ce périmètre.'
  }
  // integrity_constraint_violation (trigger) : miniature hors scope (pool
  // entreprise ou même site que la catégorie requis).
  if (code === '23514') {
    return 'Cette image n’est pas disponible pour ce périmètre.'
  }
  return errorMessage(e)
}

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
  /**
   * Création depuis le + de la page : portée VERROUILLÉE (les catégories sont en
   * commun) → le sélecteur de portée est masqué. Ignoré en édition.
   */
  lockedScope?: { portee: 'entreprise' | 'site'; siteId: string | null } | null
  /**
   * Création MINIMALE (navigation par paliers) : ne garde que Nom, Image et
   * Description (Type, Parent, État et Portée masqués). Ignoré en édition.
   */
  minimal?: boolean
  /**
   * Masque DÉFINITIVEMENT le champ « Type » (scope), création ET édition. Pour
   * les contextes où le scope est imposé (ex. onglet Gammes, toujours `gamme`) :
   * la valeur du preset / de la catégorie existante est conservée telle quelle à
   * la soumission. Si absent, le « Type » reste régi par le mode `minimal`.
   */
  hideScope?: boolean
  /**
   * Masque DÉFINITIVEMENT le champ « Portée », création ET édition. La portée
   * reste celle de `lockedScope` (création) ou de la catégorie existante
   * (édition) → soumission inchangée. Prime sur la déduction interne quand fourni.
   */
  hidePortee?: boolean
  /**
   * Masque le texte d'aide sous le titre (aucune `description` passée au
   * `FormDialog`). Pour les contextes épurés (ex. onglet Gammes).
   */
  hideDescription?: boolean
  /**
   * Masque le champ « Image » (MiniatureField). Pour les contextes hors
   * périmètre du pool de vignettes (ex. onglet Équipement, dont les cards
   * n'affichent pas d'image) : contrôle mort retiré.
   */
  hideMiniature?: boolean
}

function initialValues(
  categorie: Categorie | null | undefined,
  preset: Preset | undefined,
  canEntreprise: boolean,
  lockedScope: { portee: 'entreprise' | 'site' } | null | undefined,
): CategorieFormValues {
  if (categorie) {
    return {
      nom: categorie.nom,
      scope: categorie.scope,
      description: categorie.description ?? '',
      parent_id: categorie.parent_id ?? '',
      portee: categorie.site_id === null ? 'entreprise' : 'site',
      etat: categorie.est_actif ? 'actif' : 'inactif',
      miniature_id: categorie.miniature_id,
    }
  }
  return {
    ...emptyCategorie,
    // Portée verrouillée sur le périmètre de la page si fournie (Catégories =
    // commun) ; sinon défaut selon le rôle.
    portee: lockedScope
      ? lockedScope.portee
      : canEntreprise
        ? emptyCategorie.portee
        : 'site',
    ...(preset?.parent_id ? { parent_id: preset.parent_id } : {}),
    ...(preset?.scope ? { scope: preset.scope } : {}),
    ...(preset?.portee && !lockedScope ? { portee: preset.portee } : {}),
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
  lockedScope,
  minimal,
  hideScope,
  hidePortee: hidePorteeProp,
  hideDescription,
  hideMiniature,
}: CategoryFormDialogProps) {
  const isEdit = Boolean(categorie)
  const create = useCreateCategorie()
  const update = useUpdateCategorie()
  const [values, setValues] = useState<CategorieFormValues>(() =>
    initialValues(categorie, preset, canEntreprise, lockedScope),
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
  // Création depuis le + : la portée vient du périmètre de la page → masquée.
  // La prop explicite (ex. onglet Gammes) prime sur cette déduction interne.
  const hidePortee = hidePorteeProp ?? (!isEdit && lockedScope != null)
  // Mode minimal : juste Nom + Description, en création ET en édition (on
  // n'ajoute jamais à l'édition ce qui n'est pas proposé à la création).
  const compact = minimal === true
  // « Type » (scope) : masqué en mode compact, ou si forcé par la prop.
  const showScope = !compact && hideScope !== true
  const showPortee = !hidePortee
  // Image : périmètre = celui de la catégorie (portée) ; téléversement autorisé
  // sur le commun pour les rôles entreprise, et sur un site pour tout éditeur.
  const miniatureSite = values.portee === 'entreprise' ? null : siteId
  const canUploadMiniature = miniatureSite === null ? canEntreprise : true
  // Description adaptée au scope : l'équipement reste à un seul niveau (catégorie
  // racine), la gamme distingue catégorie racine et sous-catégorie.
  const compactDescription =
    values.scope === 'gamme'
      ? values.parent_id
        ? 'Une sous-catégorie, rattachée à sa catégorie de gammes parente.'
        : 'Une catégorie racine pour organiser tes gammes.'
      : values.scope === 'operation'
        ? 'Une catégorie pour ranger tes modèles d’opération.'
        : 'Une catégorie pour ranger tes modèles d’équipement.'
  // Sous-catégorie = présence d'un parent (catégorie existante ou présélection) :
  // adapte le titre (« catégorie » vs « sous-catégorie »).
  const estSousCat = (categorie?.parent_id ?? preset?.parent_id) != null

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
        await create.mutateAsync({
          values: parsed.data,
          siteId: lockedScope ? lockedScope.siteId : siteId,
        })
        toast.success('Catégorie créée')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(categorieErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${isEdit ? 'Modifier la' : 'Nouvelle'} ${
        estSousCat ? 'sous-catégorie' : 'catégorie'
      }`}
      description={
        hideDescription
          ? undefined
          : compact
            ? compactDescription
            : 'Une catégorie racine n’a pas de parent ; une sous-catégorie est rattachée à une catégorie parente.'
      }
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
      {!hideMiniature && (
        <MiniatureField
          value={values.miniature_id}
          onChange={(id) => set('miniature_id', id)}
          targetSiteId={miniatureSite}
          canUpload={canUploadMiniature}
        />
      )}
      {(showScope || showPortee) && (
        <div
          className={
            showScope && showPortee ? 'grid grid-cols-2 gap-4' : undefined
          }
        >
          {showScope && (
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
          )}
          {showPortee && (
            <SelectField
              label="Portée"
              value={values.portee}
              onChange={(v) =>
                set('portee', v as CategorieFormValues['portee'])
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
          label="Parent"
          value={values.parent_id}
          onChange={(v) => set('parent_id', v)}
          error={errors.parent_id}
        >
          <option value="">— Aucun (catégorie racine) —</option>
          {parentOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </SelectField>
      )}
      {!compact && (
        <SelectField
          label="État"
          value={values.etat}
          onChange={(v) => set('etat', v as CategorieFormValues['etat'])}
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
    </FormDialog>
  )
}
