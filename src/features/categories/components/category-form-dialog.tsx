import { CATEGORIE_SCOPES, categorieSchema, emptyCategorie } from '../schemas'
import type { CategorieFormValues } from '../schemas'
import { useCreateCategorie, useUpdateCategorie } from '../mutations'
import type { Categorie } from '../queries'
import { writeErrorMessage } from '@/lib/form'
import { resolvePorteeScope } from '@/lib/scope'
import type { LockedScope } from '@/lib/scope'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { PorteeField } from '@/components/common/portee-field'
import { SelectField } from '@/components/common/select-field'

/**
 * Libellés contextuels des erreurs Postgres de création/édition d'une catégorie
 * (dialog partagé entre les onglets Gammes et Équipement), passés en surcharge à
 * `writeErrorMessage` — repli sur ses messages génériques pour le reste.
 */
const CATEGORIE_ERREURS = {
  // unique_violation : index `uq_categories_nom` (nom déjà pris à cet emplacement).
  '23505': 'Une catégorie portant ce nom existe déjà à cet emplacement.',
  // insufficient_privilege : RLS (hors scope d'écriture).
  '42501': 'Action non autorisée : vous n’avez pas les droits sur ce périmètre.',
  // integrity_constraint_violation (trigger) : miniature hors scope (pool
  // entreprise ou même site que la catégorie requis).
  '23514': 'Cette image n’est pas disponible pour ce périmètre.',
} as const

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
  lockedScope?: LockedScope | null
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
  /**
   * Autorise le DÉPLACEMENT d'une sous-catégorie vers une autre catégorie
   * parente, même en mode `minimal` : affiche un sélecteur « Catégorie parente »
   * en ÉDITION d'une sous-catégorie (jamais à la création ni sur une racine).
   * L'option « racine » n'est pas proposée (préserve le modèle à deux niveaux).
   * Les parents proposés = `categories` (filtrées self + descendance).
   */
  allowReparent?: boolean
}

function initialValues(
  categorie: Categorie | null | undefined,
  preset: Preset | undefined,
  canEntreprise: boolean,
  siteId: string | null,
  lockedScope: LockedScope | null | undefined,
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
    portee: resolvePorteeScope({
      portee: emptyCategorie.portee,
      siteId,
      canEntreprise,
      lockedScope,
      isEdit: false,
    }).porteeInitiale,
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
  allowReparent,
}: CategoryFormDialogProps) {
  const isEdit = Boolean(categorie)
  const create = useCreateCategorie()
  const update = useUpdateCategorie()
  const { values, set, errors, submit, pending } = useFormDialog({
    schema: categorieSchema,
    initialValues: () =>
      initialValues(categorie, preset, canEntreprise, siteId, lockedScope),
    onSubmit: (data) =>
      categorie
        ? update.mutateAsync({ id: categorie.id, values: data, siteId })
        : create.mutateAsync({
            values: data,
            siteId: lockedScope ? lockedScope.siteId : siteId,
          }),
    successMessage: isEdit ? 'Catégorie modifiée' : 'Catégorie créée',
    close: () => onOpenChange(false),
    errorMessage: (e) => writeErrorMessage(e, CATEGORIE_ERREURS),
  })

  const excluded = categorie
    ? descendantIds(categorie.id, categories)
    : new Set<string>()
  const parentOptions = categories.filter((c) => !excluded.has(c.id))
  // Dérivés de portée/périmètre (option Commun visible, image, verrouillage)
  // mutualisés avec les autres modales de catalogue.
  const scopeResolu = resolvePorteeScope({
    portee: values.portee,
    siteId,
    canEntreprise,
    lockedScope,
    isEdit,
  })
  const showEntreprise = scopeResolu.showEntreprise
  // Création depuis le + : la portée vient du périmètre de la page → masquée.
  // La prop explicite (ex. onglet Gammes) prime sur cette déduction interne.
  const hidePortee = hidePorteeProp ?? scopeResolu.hidePortee
  // Mode minimal : juste Nom + Description, en création ET en édition (on
  // n'ajoute jamais à l'édition ce qui n'est pas proposé à la création).
  const compact = minimal === true
  // « Type » (scope) : masqué en mode compact, ou si forcé par la prop.
  const showScope = !compact && hideScope !== true
  const showPortee = !hidePortee
  // Déplacement d'une sous-catégorie vers une autre parente : en édition d'une
  // entrée AYANT un parent (donc une sous-catégorie), même en mode compact.
  const showReparent =
    allowReparent === true && isEdit && categorie?.parent_id != null
  // Le sélecteur « Parent » apparaît en mode complet (création/édition large) OU
  // pour un reparentage explicite. En reparentage, on NE propose PAS « racine »
  // (préserve le modèle racine → sous-catégorie → gamme).
  const showParentSelect = !compact || showReparent
  // Image : périmètre = celui de la catégorie (portée) ; téléversement autorisé
  // sur le commun pour les rôles entreprise, et sur un site pour tout éditeur.
  const miniatureSite = scopeResolu.miniatureSite
  const canUploadMiniature = scopeResolu.canUploadMiniature
  // Description adaptée au scope : l'équipement reste à un seul niveau (catégorie
  // racine), la gamme distingue catégorie racine et sous-catégorie.
  const compactDescription =
    values.scope === 'gamme'
      ? values.parent_id
        ? 'Une sous-catégorie, rattachée à sa catégorie de gammes parente.'
        : 'Une catégorie racine pour organiser tes gammes.'
      : values.scope === 'parc'
        ? values.parent_id
          ? 'Une sous-catégorie rattachée à une catégorie d’équipements.'
          : 'Regroupez vos équipements par grande famille (CVC, électricité, plomberie…).'
        : values.scope === 'operation'
          ? 'Une catégorie pour ranger tes modèles d’opération.'
          : 'Une catégorie pour ranger tes modèles d’équipement.'
  // Sous-catégorie = présence d'un parent (catégorie existante ou présélection) :
  // adapte le titre (« catégorie » vs « sous-catégorie »).
  const estSousCat = (categorie?.parent_id ?? preset?.parent_id) != null
  // Complément de titre selon le type : le titre nomme explicitement CE QUE la
  // catégorie range, pour coller à l'onglet où l'on se trouve (« Nouvelle catégorie
  // de modèles d'équipement », etc.) et lever toute ambiguïté.
  const titreComplement = (
    {
      parc: ' d’équipements',
      equipement: ' de modèles d’équipement',
      operation: ' de modèles d’opération',
      gamme: ' de gammes',
      mixte: '',
    } as Record<CategorieFormValues['scope'], string>
  )[values.scope]

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${isEdit ? 'Modifier la' : 'Nouvelle'} ${
        estSousCat ? 'sous-catégorie' : 'catégorie'
      }${titreComplement}`}
      description={
        hideDescription
          ? undefined
          : compact
            ? compactDescription
            : 'Une catégorie racine n’a pas de parent ; une sous-catégorie est rattachée à une catégorie parente.'
      }
      onSubmit={() => void submit()}
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
        image={
          hideMiniature
            ? undefined
            : {
                value: values.miniature_id,
                onChange: (id) => set('miniature_id', id),
                targetSiteId: miniatureSite,
                canUpload: canUploadMiniature,
              }
        }
      />
      {(showScope || showPortee) && (
        <div
          className={
            showScope && showPortee
              ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
              : undefined
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
            <PorteeField
              value={values.portee}
              onChange={(v) => set('portee', v)}
              showEntreprise={showEntreprise}
              siteId={siteId}
              siteName={siteName}
              error={errors.portee}
            />
          )}
        </div>
      )}
      {showParentSelect && (
        <SelectField
          label={showReparent ? 'Catégorie parente' : 'Parent'}
          value={values.parent_id}
          onChange={(v) => set('parent_id', v)}
          error={errors.parent_id}
          hint={
            showReparent
              ? 'Choisir une autre catégorie déplace la sous-catégorie et ses gammes.'
              : undefined
          }
        >
          {!showReparent && (
            <option value="">— Aucun (catégorie racine) —</option>
          )}
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
    </FormDialog>
  )
}
