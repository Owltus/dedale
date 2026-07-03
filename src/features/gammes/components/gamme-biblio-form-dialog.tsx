import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { emptyGammeBiblio, gammeBiblioSchema } from '../schemas'
import type { GammeBiblioFormValues } from '../schemas'
import { useCreateGammeBiblio, useUpdateGammeBiblio } from '../mutations'
import { referentielsQueries, type GammeBiblioRow } from '../queries'
import { useAuth } from '@/auth'
import { writeErrorMessage, type SqlstateOverrides } from '@/lib/form'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/fields/identite-fields'
import { RadioField } from '@/components/common/fields/radio-field'
import { SelectField } from '@/components/common/fields/select-field'

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
  const form = useForm<GammeBiblioFormValues>({
    resolver: zodResolver(gammeBiblioSchema),
    defaultValues: initialValues(gamme, lockedCategorieId),
  })
  const submit = useSubmitDialog<GammeBiblioFormValues>({
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

  const periodiciteOptions = [
    { value: '', label: '— Choisir une périodicité —' },
    ...periodicites.map((p) => ({ value: String(p.id), label: p.libelle })),
  ]
  const categorieOptions = [
    { value: '', label: '— Choisir une catégorie —' },
    ...categories.map((c) => ({ value: c.id, label: c.nom })),
  ]

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={isEdit ? 'Modifier la gamme-template' : 'Nouvelle gamme-template'}
        description="Un gabarit commun réutilisable, rangé dans l’arborescence des catégories."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        <IdentiteFields
          control={form.control}
          nomName="nom"
          descriptionName="description"
          image={{ name: 'miniature_id', targetSiteId: null, canUpload: true }}
        />

        <RadioField
          control={form.control}
          name="nature"
          label="Nature"
          required
          options={[
            {
              value: 'controle_reglementaire',
              label: 'Contrôle réglementaire',
              description: 'Attend des documents justificatifs.',
            },
            { value: 'maintenance_preventive', label: 'Maintenance préventive' },
          ]}
        />

        <SelectField
          control={form.control}
          name="periodicite_id"
          label="Périodicité"
          required
          options={periodiciteOptions}
        />

        <SelectField
          control={form.control}
          name="categorie_id"
          label="Catégorie"
          required
          options={categorieOptions}
        />
      </FormDialog>
    </Form>
  )
}
