import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyGamme, gammeNatures, gammeSchema } from '../schemas'
import type { GammeFormValues } from '../schemas'
import { useCreateGamme, useUpdateGamme } from '../mutations'
import { gammesQueries, referentielsQueries } from '../queries'
import type { SousCategorieGamme } from '../queries'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { categoriesQueries } from '@/features/categories/queries'
import { useAuth } from '@/auth'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'
import type { Database } from '@/lib/database.types'

type Gamme = Database['public']['Tables']['gammes']['Row']

const NATURE_LABEL: Record<(typeof gammeNatures)[number], string> = {
  controle_reglementaire: 'Contrôle réglementaire',
  maintenance_preventive: 'Maintenance préventive',
}

interface GammeFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  gamme?: Gamme | null
  /**
   * Sous-catégorie pré-sélectionnée à la CRÉATION (ex. on crée une gamme depuis la
   * sous-catégorie ouverte dans l'explorateur Plan de maintenance). Ignoré en
   * édition (la gamme porte déjà sa `categorie_id`).
   */
  presetCategorieId?: string | null
}

function initialValues(
  gamme: Gamme | null | undefined,
  presetCategorieId?: string | null,
): GammeFormValues {
  if (!gamme)
    return presetCategorieId
      ? { ...emptyGamme, categorie_id: presetCategorieId }
      : emptyGamme
  return {
    nom: gamme.nom,
    nature: gamme.nature,
    periodicite_id: String(gamme.periodicite_id),
    // Une gamme réelle de site a toujours un prestataire (obligatoire) ; garde-
    // fou de typage depuis que la colonne est nullable (templates communs).
    prestataire_id: gamme.prestataire_id ?? '',
    categorie_id: gamme.categorie_id,
    description: gamme.description ?? '',
    miniature_id: gamme.miniature_id,
  }
}

/** Sous-catégories regroupées par catégorie racine parente, triées par nom. */
function groupByParent(
  sousCategories: SousCategorieGamme[],
): { parentId: string; parentNom: string; subs: SousCategorieGamme[] }[] {
  const groups = new Map<
    string,
    { parentId: string; parentNom: string; subs: SousCategorieGamme[] }
  >()
  for (const sc of sousCategories) {
    const group = groups.get(sc.parentId) ?? {
      parentId: sc.parentId,
      parentNom: sc.parentNom,
      subs: [],
    }
    group.subs.push(sc)
    groups.set(sc.parentId, group)
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      subs: [...g.subs].sort((a, b) => a.nom.localeCompare(b.nom)),
    }))
    .sort((a, b) => a.parentNom.localeCompare(b.parentNom))
}

export function GammeFormDialog({
  open,
  onOpenChange,
  siteId,
  gamme,
  presetCategorieId,
}: GammeFormDialogProps) {
  const isEdit = Boolean(gamme)
  const { session } = useAuth()
  const create = useCreateGamme()
  const update = useUpdateGamme()
  const { data: periodicites = [] } = useQuery(
    referentielsQueries.periodicites(),
  )
  const { data: prestataires = [] } = useQuery(prestatairesQueries.list())
  const sousCategoriesQuery = useQuery(gammesQueries.sousCategories(siteId))
  const sousCategories = useMemo(
    () => sousCategoriesQuery.data ?? [],
    [sousCategoriesQuery.data],
  )
  const [values, setValues] = useState<GammeFormValues>(() =>
    initialValues(gamme, presetCategorieId),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  // Sous-catégorie réellement assignée (édition) : si elle est masquée (inactive)
  // elle n'est pas dans la liste → on la lit pour la réinjecter, afin que le
  // select reflète la valeur réelle de la gamme.
  const assignedId = gamme?.categorie_id ?? null
  const assignedMissing =
    assignedId !== null && !sousCategories.some((sc) => sc.id === assignedId)
  const { data: assignedCategorie } = useQuery(
    categoriesQueries.byId(assignedMissing ? assignedId : null),
  )

  // Impasse : aucune sous-catégorie de gamme dans ce périmètre. La page Gammes
  // n'en crée pas → on guide vers la Bibliothèque et on bloque la soumission
  // quand aucune valeur n'est sélectionnable (champ requis).
  const aucuneSousCategorie =
    !sousCategoriesQuery.isPending && sousCategories.length === 0
  const aucuneOption = aucuneSousCategorie && !assignedMissing

  // Sous-catégories regroupées par catégorie racine (affichage en `<optgroup>`).
  const groupedSousCategories = useMemo(
    () => groupByParent(sousCategories),
    [sousCategories],
  )

  function set<K extends keyof GammeFormValues>(
    key: K,
    value: GammeFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = gammeSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (gamme) {
        await update.mutateAsync({ id: gamme.id, values: parsed.data })
        toast.success('Gamme modifiée')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          siteId,
          createdBy: session.user.id,
          values: parsed.data,
        })
        toast.success('Gamme créée')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier la gamme' : 'Nouvelle gamme'}
      description="Renseigne la nature, la périodicité (semaines ISO) et le prestataire par défaut."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
      submitDisabled={aucuneOption}
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
          // Périmètre = le site de la gamme : le pool propose les vignettes
          // communes + celles de ce site (le trigger backend le garantit).
          targetSiteId: siteId,
          canUpload: true,
        }}
      />

      <SelectField
        label="Nature"
        required
        id="gamme_nature"
        value={values.nature}
        onChange={(v) => set('nature', v as GammeFormValues['nature'])}
        error={errors.nature}
      >
        {gammeNatures.map((n) => (
          <option key={n} value={n}>
            {NATURE_LABEL[n]}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Périodicité"
        required
        id="gamme_periodicite"
        value={values.periodicite_id}
        onChange={(v) => set('periodicite_id', v)}
        error={errors.periodicite_id}
      >
        <option value="">— Choisir une périodicité —</option>
        {periodicites.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.libelle}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Prestataire par défaut"
        required
        id="gamme_prestataire"
        value={values.prestataire_id}
        onChange={(v) => set('prestataire_id', v)}
        error={errors.prestataire_id}
      >
        <option value="">— Choisir un prestataire —</option>
        {prestataires.map((p) => (
          <option key={p.id} value={p.id}>
            {p.libelle}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-2">
        <SelectField
          label="Sous-catégorie"
          required
          id="gamme_categorie"
          value={values.categorie_id}
          onChange={(v) => set('categorie_id', v)}
          error={errors.categorie_id}
        >
          <option value="">— Choisir une sous-catégorie —</option>
          {assignedMissing && (
            <option value={assignedId}>
              {assignedCategorie?.nom ?? 'Sous-catégorie actuelle'} (actuelle)
            </option>
          )}
          {groupedSousCategories.map((group) => (
            <optgroup key={group.parentId} label={group.parentNom}>
              {group.subs.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.nom}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        {aucuneSousCategorie && (
          <p className="text-muted-foreground text-sm">
            Aucune sous-catégorie de gamme dans ce périmètre. Pour en créer,
            passe par <span className="font-medium">Bibliothèque › Plan de maintenance</span>
            .
          </p>
        )}
      </div>
    </FormDialog>
  )
}
