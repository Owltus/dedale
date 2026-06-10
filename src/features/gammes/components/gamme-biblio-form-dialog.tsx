import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  emptyGammeBiblio,
  gammeBiblioSchema,
  gammeNatures,
} from '../schemas'
import type { GammeBiblioFormValues } from '../schemas'
import { useCreateGammeBiblio, useUpdateGammeBiblio } from '../mutations'
import { referentielsQueries, type GammeBiblioRow } from '../queries'
import { prestatairesQueries } from '@/features/prestataires/queries'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { TextareaField } from '@/components/common/textarea-field'

const NATURE_LABEL: Record<(typeof gammeNatures)[number], string> = {
  controle_reglementaire: 'Contrôle réglementaire',
  maintenance_preventive: 'Maintenance préventive',
}

interface CategorieOption {
  id: string
  nom: string
}

interface GammeBiblioFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  gamme?: GammeBiblioRow | null
  /** Catégories sélectionnables (scope gamme/mixte du périmètre courant). */
  categories: CategorieOption[]
  /** Droit de créer/éditer sur le scope entreprise (admin/manager). */
  canEntreprise: boolean
  siteId: string | null
  siteName: string | null
  /**
   * Création depuis le périmètre courant : portée VERROUILLÉE (sélecteur masqué).
   * Ignoré en édition (la portée suit alors la gamme).
   */
  lockedScope?: { portee: 'entreprise' | 'site'; siteId: string | null } | null
  /**
   * Création dans une catégorie imposée (navigation) : catégorie verrouillée →
   * le sélecteur de catégorie est masqué. Ignoré en édition.
   */
  lockedCategorieId?: string | null
}

function initialValues(
  gamme: GammeBiblioRow | null | undefined,
  lockedScope: { portee: 'entreprise' | 'site' } | null | undefined,
  lockedCategorieId: string | null | undefined,
): GammeBiblioFormValues {
  if (gamme) {
    return {
      nom: gamme.nom,
      nature: gamme.nature,
      periodicite_id: String(gamme.periodicite_id),
      prestataire_id: gamme.prestataire_id,
      description: gamme.description ?? '',
      categorie_id: gamme.categorie_id,
      portee: gamme.site_id === null ? 'entreprise' : 'site',
    }
  }
  return {
    ...emptyGammeBiblio,
    portee: lockedScope ? lockedScope.portee : emptyGammeBiblio.portee,
    ...(lockedCategorieId ? { categorie_id: lockedCategorieId } : {}),
  }
}

export function GammeBiblioFormDialog({
  open,
  onOpenChange,
  gamme,
  categories,
  canEntreprise,
  siteId,
  siteName,
  lockedScope,
  lockedCategorieId,
}: GammeBiblioFormDialogProps) {
  const isEdit = Boolean(gamme)
  const { session } = useAuth()
  const create = useCreateGammeBiblio()
  const update = useUpdateGammeBiblio()
  const { data: periodicites = [] } = useQuery(
    referentielsQueries.periodicites(),
  )
  const { data: prestataires = [] } = useQuery(prestatairesQueries.list())
  const [values, setValues] = useState<GammeBiblioFormValues>(() =>
    initialValues(gamme, lockedScope, lockedCategorieId),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  // Catégorie / portée imposées par la navigation → sélecteurs masqués (création).
  const hideCategorie = !isEdit && lockedCategorieId != null
  const hidePortee = !isEdit && lockedScope != null
  // En édition, la portée suit la gamme (on n'écrit jamais un site_id par erreur).
  const showPortee = !hidePortee && !isEdit
  const showEntreprise = canEntreprise || values.portee === 'entreprise'

  // Site cible effectif (résout portée=site → un id de site).
  const effectiveSiteId = isEdit
    ? (gamme?.site_id ?? null)
    : (lockedScope ? lockedScope.siteId : siteId)

  // Site pertinent pour les prestataires SELON la portée courante :
  // portée commune (entreprise) → aucun site (un interne est TOUJOURS lié à un
  // site, cf. CHECK est_interne = site_id IS NOT NULL → pas d'interne commun) ;
  // portée site → le site cible.
  const prestataireSiteId = values.portee === 'site' ? effectiveSiteId : null

  // Options du select filtrées par portée : commun → uniquement les prestataires
  // communs (site_id NULL) ; site → ceux du site cible + les communs.
  const prestataireOptions = useMemo(
    () =>
      prestataires.filter((p) =>
        prestataireSiteId === null
          ? p.site_id === null
          : p.site_id === null || p.site_id === prestataireSiteId,
      ),
    [prestataires, prestataireSiteId],
  )

  // Défaut à la création (tant que rien n'est choisi), dépendant de la portée :
  // site → l'interne DE CE SITE ; commun → pas d'interne disponible, on laisse
  // vide (prestataire_id.min(1) obligera l'utilisateur à choisir).
  const defaultPrestataireId = useMemo(
    () =>
      prestataireSiteId === null
        ? ''
        : (prestataires.find(
            (p) => p.est_interne && p.site_id === prestataireSiteId,
          )?.id ?? ''),
    [prestataires, prestataireSiteId],
  )
  const prestataireValue =
    !isEdit && values.prestataire_id === ''
      ? defaultPrestataireId
      : values.prestataire_id

  function set<K extends keyof GammeBiblioFormValues>(
    key: K,
    value: GammeBiblioFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = gammeBiblioSchema.safeParse({
      ...values,
      prestataire_id: prestataireValue,
    })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (gamme) {
        await update.mutateAsync({
          id: gamme.id,
          siteId: effectiveSiteId,
          values: parsed.data,
        })
        toast.success('Gamme-template modifiée')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          siteId: effectiveSiteId,
          createdBy: session.user.id,
          values: parsed.data,
        })
        toast.success('Gamme-template créée')
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
      title={isEdit ? 'Modifier la gamme-template' : 'Nouvelle gamme-template'}
      description="Un gabarit réutilisable, rangé dans l’arborescence des catégories."
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

      <SelectField
        label="Nature"
        required
        id="gamme_biblio_nature"
        value={values.nature}
        onChange={(v) => set('nature', v as GammeBiblioFormValues['nature'])}
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
        id="gamme_biblio_periodicite"
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

      {!hideCategorie && (
        <SelectField
          label="Catégorie"
          required
          id="gamme_biblio_categorie"
          value={values.categorie_id}
          onChange={(v) => set('categorie_id', v)}
          error={errors.categorie_id}
        >
          <option value="">— Choisir une catégorie —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </SelectField>
      )}

      <SelectField
        label="Prestataire par défaut"
        required
        id="gamme_biblio_prestataire"
        value={prestataireValue}
        onChange={(v) => set('prestataire_id', v)}
        error={errors.prestataire_id}
      >
        <option value="">— Choisir un prestataire —</option>
        {prestataireOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.libelle}
          </option>
        ))}
      </SelectField>

      {showPortee && (
        <SelectField
          label="Portée"
          required
          id="gamme_biblio_portee"
          value={values.portee}
          onChange={(v) => set('portee', v as GammeBiblioFormValues['portee'])}
          error={errors.portee}
        >
          {showEntreprise && <option value="entreprise">Commun</option>}
          {siteId && <option value="site">{siteName ?? 'Site actif'}</option>}
        </SelectField>
      )}

      <TextareaField
        label="Description"
        id="gamme_biblio_description"
        value={values.description}
        onChange={(v) => set('description', v)}
        rows={3}
        error={errors.description}
      />
    </FormDialog>
  )
}
