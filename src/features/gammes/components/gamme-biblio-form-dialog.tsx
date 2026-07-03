import { useQuery } from '@tanstack/react-query'
import { emptyGammeBiblio, gammeBiblioSchema, gammeNatures } from '../schemas'
import type { GammeBiblioFormValues } from '../schemas'
import { useCreateGammeBiblio, useUpdateGammeBiblio } from '../mutations'
import { referentielsQueries, type GammeBiblioRow } from '../queries'
import { useAuth } from '@/auth'
import { writeErrorMessage, type SqlstateOverrides } from '@/lib/form'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'

const NATURE_LABEL: Record<(typeof gammeNatures)[number], string> = {
  controle_reglementaire: 'Contrôle réglementaire',
  maintenance_preventive: 'Maintenance préventive',
}

/**
 * Libellés d'erreur propres à la création/édition d'une gamme-template commune —
 * surchargent les messages génériques de `writeErrorMessage` (repli automatique
 * sur ceux-ci pour les autres codes).
 */
const GAMME_BIBLIO_ERREURS: SqlstateOverrides = {
  // unique_violation : index `uniq_gammes_entreprise` (homonyme déjà présent).
  '23505': 'Une gamme-template portant ce nom existe déjà.',
  // insufficient_privilege : RLS (hors scope d'écriture).
  '42501': 'Action non autorisée : vous n’avez pas les droits.',
  // integrity_constraint_violation (trigger) : miniature hors scope.
  '23514': 'Cette image n’est pas disponible pour ce périmètre.',
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
      miniature_id: gamme.miniature_id,
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
  const form = useFormDialog({
    schema: gammeBiblioSchema,
    initialValues: () => initialValues(gamme, lockedCategorieId),
    onSubmit: async (data) => {
      if (gamme) {
        // Commun : `siteId` NULL (la portée du payload reste entreprise).
        await update.mutateAsync({ id: gamme.id, siteId: null, values: data })
        return
      }
      if (!session) throw new Error('Session expirée, reconnecte-toi.')
      await create.mutateAsync({
        siteId: null,
        createdBy: session.user.id,
        values: data,
      })
    },
    successMessage: isEdit ? 'Gamme-template modifiée' : 'Gamme-template créée',
    close: () => onOpenChange(false),
    errorMessage: (e) => writeErrorMessage(e, GAMME_BIBLIO_ERREURS),
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier la gamme-template' : 'Nouvelle gamme-template'}
      description="Un gabarit commun réutilisable, rangé dans l’arborescence des catégories."
      onSubmit={() => void form.submit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      <IdentiteFields
        nom={{
          value: form.values.nom,
          onChange: (v) => form.set('nom', v),
          error: form.errors.nom,
        }}
        description={{
          value: form.values.description,
          onChange: (v) => form.set('description', v),
          error: form.errors.description,
        }}
        image={{
          value: form.values.miniature_id,
          onChange: (id) => form.set('miniature_id', id),
          targetSiteId: null,
          canUpload: true,
        }}
      />

      <SelectField
        label="Nature"
        required
        id="gamme_biblio_nature"
        value={form.values.nature}
        onChange={(v) => form.set('nature', v as GammeBiblioFormValues['nature'])}
        error={form.errors.nature}
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
        value={form.values.periodicite_id}
        onChange={(v) => form.set('periodicite_id', v)}
        error={form.errors.periodicite_id}
      >
        <option value="">— Choisir une périodicité —</option>
        {periodicites.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.libelle}
          </option>
        ))}
      </SelectField>

      <SelectField
        label="Catégorie"
        required
        id="gamme_biblio_categorie"
        value={form.values.categorie_id}
        onChange={(v) => form.set('categorie_id', v)}
        error={form.errors.categorie_id}
      >
        <option value="">— Choisir une catégorie —</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
          </option>
        ))}
      </SelectField>
    </FormDialog>
  )
}
