import { useState } from 'react'
import { toast } from 'sonner'
import {
  useCreateParcSousCategorie,
  useUpdateParcSousCategorie,
} from '../mutations'
import {
  parseChamps,
  prepareChamps,
  serializeChamps,
  type Champ,
} from '@/lib/champs'
import { errorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { IdentiteFields } from '@/components/common/identite-fields'
import { SelectField } from '@/components/common/select-field'
import { ChampsListEditor } from '@/components/common/champs-list-editor'
import type { Categorie } from '@/features/categories/queries'

interface ParcSousCategorieDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Catégorie parente (niveau 1) sous laquelle créer la sous-catégorie. */
  parentId: string
  /** Modèles DU SITE proposés (un modèle commun doit d'abord être exporté). */
  modeles: { id: string; nom: string }[]
  /** Sous-catégorie à MODIFIER. Absent = création. */
  categorie?: Categorie | null
  /**
   * Équipements de la sous-catégorie (édition d'un gabarit spécifique) : mis à jour
   * par propagation à l'enregistrement. Ignoré en création.
   */
  equipements?: { id: string; specifications: unknown }[]
}

/**
 * Formulaire UNIQUE création + édition d'une SOUS-catégorie de parc, identique dans
 * les deux cas : Nom + Description + Image + GABARIT dont héritent ses équipements :
 * - « Spécifique » → caractéristiques définies ICI (comme un modèle, mais local :
 *   rien ne va dans la Bibliothèque ; en édition elles se propagent aux équipements) ;
 * - un MODÈLE du site → les équipements en sont des copies (gabarit géré en Biblio).
 *
 * Le TYPE de gabarit (modèle ↔ spécifique) est une décision STRUCTURELLE prise à la
 * création : en édition il est verrouillé (affiché, non modifiable).
 */
export function ParcSousCategorieDialog({
  open,
  onOpenChange,
  siteId,
  parentId,
  modeles,
  categorie,
  equipements = [],
}: ParcSousCategorieDialogProps) {
  const isEdit = Boolean(categorie)
  const create = useCreateParcSousCategorie()
  const update = useUpdateParcSousCategorie()
  const pending = create.isPending || update.isPending

  const [nom, setNom] = useState(categorie?.nom ?? '')
  const [description, setDescription] = useState(categorie?.description ?? '')
  const [miniatureId, setMiniatureId] = useState<string | null>(
    categorie?.miniature_id ?? null,
  )
  // '' = gabarit spécifique (défini ici) ; sinon id d'un modèle de site. Verrouillé
  // en édition : la valeur initiale est celle de la sous-catégorie existante.
  const [modeleId, setModeleId] = useState(
    categorie?.modele_equipement_id ?? '',
  )
  const [champs, setChamps] = useState<Champ[]>(() =>
    categorie ? parseChamps(categorie.specifications) : [],
  )
  const [errors, setErrors] = useState<{ nom?: string }>({})

  const specifique = modeleId === ''
  // Libellé du modèle fixé (édition liée à un modèle), pour l'afficher en lecture.
  const modeleNom = modeles.find((m) => m.id === modeleId)?.nom

  async function handleSubmit() {
    if (!nom.trim()) {
      setErrors({ nom: 'Le nom est obligatoire' })
      return
    }
    setErrors({})

    // Validation des champs (gabarit spécifique uniquement).
    let preparedChamps: Champ[] = []
    if (specifique) {
      const prepared = prepareChamps(champs)
      if (!prepared.ok) {
        toast.error(prepared.error)
        return
      }
      preparedChamps = prepared.champs
    }

    try {
      if (categorie) {
        await update.mutateAsync({
          id: categorie.id,
          nom,
          description,
          miniatureId,
          specifique,
          champs: preparedChamps,
          equipements,
        })
        toast.success('Sous-catégorie modifiée')
      } else {
        await create.mutateAsync({
          nom,
          parentId,
          siteId,
          description,
          miniatureId,
          modeleId: specifique ? null : modeleId,
          specifications: specifique ? serializeChamps(preparedChamps) : null,
        })
        toast.success('Sous-catégorie créée')
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
      title={
        isEdit
          ? 'Modifier la sous-catégorie d’équipements'
          : 'Nouvelle sous-catégorie d’équipements'
      }
      description="Les équipements de cette sous-catégorie partageront les mêmes caractéristiques et la même image."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Créer'}
      pendingLabel="Enregistrement…"
      pending={pending}
      contentClassName="sm:max-w-2xl"
    >
      <IdentiteFields
        nom={{ value: nom, onChange: setNom, error: errors.nom }}
        description={{ value: description, onChange: setDescription }}
        image={{
          value: miniatureId,
          onChange: setMiniatureId,
          targetSiteId: siteId,
          canUpload: true,
        }}
      />

      <SelectField
        label="Gabarit des équipements"
        id="parc_subcat_source"
        value={modeleId}
        onChange={setModeleId}
        // Décision structurelle prise à la création : non modifiable ensuite.
        disabled={isEdit}
      >
        <option value="">Spécifique (définir les caractéristiques ici)</option>
        {modeles.map((m) => (
          <option key={m.id} value={m.id}>
            Modèle : {m.nom}
          </option>
        ))}
      </SelectField>

      {specifique ? (
        <ChampsListEditor
          champs={champs}
          onChange={setChamps}
          emptyHint="Aucune caractéristique. Ajoute des champs (ex. Puissance, Marque…) ; les équipements de cette sous-catégorie en hériteront."
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          Les caractéristiques sont héritées du modèle
          {modeleNom ? ` « ${modeleNom} »` : ''} et se modifient dans la
          Bibliothèque.
        </p>
      )}
    </FormDialog>
  )
}
