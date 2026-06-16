import { useState } from 'react'
import { toast } from 'sonner'
import { useCreateParcSousCategorie } from '../mutations'
import { prepareChamps, serializeChamps, type Champ } from '@/lib/champs'
import { errorMessage } from '@/lib/form'
import { MiniatureField } from '@/features/miniatures/components/miniature-field'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'
import { ChampsListEditor } from '@/components/common/champs-list-editor'

interface ParcSousCategorieDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Catégorie parente (niveau 1) sous laquelle créer la sous-catégorie. */
  parentId: string
  /** Modèles DU SITE proposés (un modèle commun doit d'abord être exporté). */
  modeles: { id: string; nom: string }[]
}

/**
 * Création d'une SOUS-catégorie de parc : un vrai formulaire (nom, description,
 * image) + le GABARIT dont hériteront ses équipements :
 * - « Spécifique » (défaut) → on définit les caractéristiques ICI (comme un modèle,
 *   mais local : rien ne va dans la Bibliothèque) ;
 * - un MODÈLE du site → les équipements en seront des copies.
 */
export function ParcSousCategorieDialog({
  open,
  onOpenChange,
  siteId,
  parentId,
  modeles,
}: ParcSousCategorieDialogProps) {
  const create = useCreateParcSousCategorie()
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [miniatureId, setMiniatureId] = useState<string | null>(null)
  // '' = gabarit spécifique (défini ici) ; sinon id d'un modèle de site.
  const [modeleId, setModeleId] = useState('')
  const [champs, setChamps] = useState<Champ[]>([])
  const [errors, setErrors] = useState<{ nom?: string }>({})

  const specifique = modeleId === ''

  async function handleSubmit() {
    if (!nom.trim()) {
      setErrors({ nom: 'Le nom est obligatoire' })
      return
    }
    setErrors({})

    let specifications: { champs: Champ[] } | null = null
    let chosenModele: string | null = null
    if (specifique) {
      const prepared = prepareChamps(champs)
      if (!prepared.ok) {
        toast.error(prepared.error)
        return
      }
      specifications = serializeChamps(prepared.champs)
    } else {
      chosenModele = modeleId
    }

    try {
      await create.mutateAsync({
        nom,
        parentId,
        siteId,
        description,
        miniatureId,
        modeleId: chosenModele,
        specifications,
      })
      toast.success('Sous-catégorie créée')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nouvelle sous-catégorie"
      description="Définis le gabarit dont hériteront tous les équipements de cette sous-catégorie."
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={create.isPending}
      contentClassName="sm:max-w-2xl"
    >
      <TextField
        label="Nom"
        value={nom}
        onChange={setNom}
        error={errors.nom}
        required
      />
      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
      />
      <MiniatureField
        value={miniatureId}
        onChange={setMiniatureId}
        targetSiteId={siteId}
        canUpload
      />

      <SelectField
        label="Gabarit des équipements"
        id="parc_subcat_source"
        value={modeleId}
        onChange={setModeleId}
      >
        <option value="">Spécifique (définir les caractéristiques ici)</option>
        {modeles.map((m) => (
          <option key={m.id} value={m.id}>
            Modèle : {m.nom}
          </option>
        ))}
      </SelectField>

      {specifique && (
        <ChampsListEditor
          champs={champs}
          onChange={setChamps}
          emptyHint="Aucune caractéristique. Ajoute des champs (ex. Puissance, Marque…) ; les équipements de cette sous-catégorie en hériteront."
        />
      )}
    </FormDialog>
  )
}
