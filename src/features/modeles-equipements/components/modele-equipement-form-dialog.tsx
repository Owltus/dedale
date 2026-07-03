import { emptyModeleEquipement, modeleEquipementSchema } from '../schemas'
import type { ModeleEquipementFormValues } from '../schemas'
import {
  useCreateModeleEquipement,
  useUpdateModeleEquipement,
} from '../mutations'
import type { ModeleEquipement } from '../queries'
import { parseChamps } from '@/lib/champs'
import { useFormDialog } from '@/hooks/use-form-dialog'
import { resolvePorteeScope, type LockedScope } from '@/lib/scope'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'
import { PorteeField } from '@/components/common/portee-field'

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
   * Création depuis le + de la page : portée VERROUILLÉE sur le périmètre choisi.
   * Ignoré en édition. (Ce formulaire garde le sélecteur de portée VISIBLE — la
   * portée reste éditable des deux côtés — mais la valeur initiale s'en déduit.)
   */
  lockedScope?: LockedScope | null
  /**
   * Création dans une catégorie imposée (navigation par paliers) : sert de valeur
   * initiale de catégorie. Ignoré en édition.
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
  lockedScope: LockedScope | null | undefined,
  lockedCategorieId: string | null | undefined,
  siteId: string | null,
): ModeleEquipementFormValues {
  if (!modele)
    return {
      ...emptyModeleEquipement,
      // Portée verrouillée sur le périmètre de la page si fournie ; sinon défaut
      // selon le rôle (un tech ne crée que des modèles de site).
      portee: resolvePorteeScope({
        portee: emptyModeleEquipement.portee,
        siteId,
        canEntreprise,
        lockedScope,
        isEdit: false,
      }).porteeInitiale,
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

  const form = useFormDialog({
    schema: modeleEquipementSchema,
    initialValues: () =>
      initialValues(modele, canEntreprise, lockedScope, lockedCategorieId, siteId),
    // Les CARACTÉRISTIQUES (`specifications`) ne s'éditent pas ici : la création
    // les écrit vides et l'UPDATE ne les touche jamais (gérées sur la page de
    // détail, un champ à la fois) — voir `modelePayload` (mutations.ts).
    onSubmit: async (data) => {
      if (modele) {
        await update.mutateAsync({ id: modele.id, values: data, siteId })
        return
      }
      await create.mutateAsync({ values: data, siteId: createSiteId })
    },
    successMessage: isEdit ? 'Modèle modifié' : 'Modèle créé',
    close: () => onOpenChange(false),
  })

  // Catégorie / Portée : VISIBLES et éditables en création ET modification (mêmes
  // champs des deux côtés). À la création, leur valeur par défaut vient du contexte
  // (catégorie du drill, périmètre du sélecteur de site).
  // Mode minimal (optionnel) : masque l'État. Les caractéristiques détaillées se
  // gèrent de toute façon sur la PAGE de détail du modèle.
  const compact = minimal === true
  // Image : périmètre = portée du modèle (commun → pool entreprise, sinon site).
  // Téléversement autorisé sur le commun pour les rôles entreprise, sur un site
  // pour tout éditeur (calque du formulaire de catégorie).
  const { showEntreprise, miniatureSite, canUploadMiniature, createSiteId } =
    resolvePorteeScope({
      portee: form.values.portee,
      siteId,
      canEntreprise,
      lockedScope,
      isEdit,
    })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        isEdit ? 'Modifier le modèle d’équipement' : 'Nouveau modèle d’équipement'
      }
      description="Un gabarit réutilisable pour instancier rapidement des équipements."
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
          targetSiteId: miniatureSite,
          canUpload: canUploadMiniature,
        }}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          label="Catégorie"
          value={form.values.categorie_id}
          onChange={(v) => form.set('categorie_id', v)}
          error={form.errors.categorie_id}
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
        <PorteeField
          value={form.values.portee}
          onChange={(v) => form.set('portee', v)}
          error={form.errors.portee}
          showEntreprise={showEntreprise}
          siteId={siteId}
          siteName={siteName}
        />
      </div>
      {!compact && (
        <SelectField
          label="État"
          value={form.values.etat}
          onChange={(v) =>
            form.set('etat', v as ModeleEquipementFormValues['etat'])
          }
        >
          <option value="actif">Actif</option>
          <option value="inactif">Masqué</option>
        </SelectField>
      )}
    </FormDialog>
  )
}
