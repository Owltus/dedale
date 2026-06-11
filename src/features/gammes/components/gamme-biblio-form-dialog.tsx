import { useState } from 'react'
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
  /** Sous-catégories communes (niveau 2) sélectionnables. */
  categories: CategorieOption[]
  /**
   * Création dans une catégorie imposée (navigation) : catégorie verrouillée →
   * le sélecteur de catégorie est masqué. Ignoré en édition.
   */
  lockedCategorieId?: string | null
}

function initialValues(
  gamme: GammeBiblioRow | null | undefined,
  lockedCategorieId: string | null | undefined,
): GammeBiblioFormValues {
  if (gamme) {
    return {
      nom: gamme.nom,
      nature: gamme.nature,
      periodicite_id: String(gamme.periodicite_id),
      // Un template commun n'a pas de prestataire (renseigné après copie sur un
      // site) : le formulaire ne porte plus ce champ → toujours vide ici.
      prestataire_id: '',
      description: gamme.description ?? '',
      categorie_id: gamme.categorie_id,
      // Onglet Gammes de la Bibliothèque = COMMUN uniquement (site_id NULL).
      portee: 'entreprise',
    }
  }
  return {
    ...emptyGammeBiblio,
    ...(lockedCategorieId ? { categorie_id: lockedCategorieId } : {}),
  }
}

/**
 * Création / édition d'une gamme-template COMMUNE (portée entreprise, `site_id`
 * NULL inviolable). L'onglet Gammes de la Bibliothèque ne gère que des templates
 * communs : aucun choix de portée ni de site ici (la copie vers un site se fait
 * via « Copier vers un site », hors de ce formulaire).
 */
export function GammeBiblioFormDialog({
  open,
  onOpenChange,
  gamme,
  categories,
  lockedCategorieId,
}: GammeBiblioFormDialogProps) {
  const isEdit = Boolean(gamme)
  const { session } = useAuth()
  const create = useCreateGammeBiblio()
  const update = useUpdateGammeBiblio()
  const { data: periodicites = [] } = useQuery(
    referentielsQueries.periodicites(),
  )
  const [values, setValues] = useState<GammeBiblioFormValues>(() =>
    initialValues(gamme, lockedCategorieId),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  // Catégorie imposée par la navigation → sélecteur masqué (création).
  const hideCategorie = !isEdit && lockedCategorieId != null

  function set<K extends keyof GammeBiblioFormValues>(
    key: K,
    value: GammeBiblioFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = gammeBiblioSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (gamme) {
        // Commun : `siteId` NULL (la portée du payload reste entreprise).
        await update.mutateAsync({
          id: gamme.id,
          siteId: null,
          values: parsed.data,
        })
        toast.success('Gamme-template modifiée')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          siteId: null,
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
      description="Un gabarit commun réutilisable, rangé dans l’arborescence des catégories."
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
