import { useState } from 'react'
import { toast } from 'sonner'
import { useCreateParcSousCategorie } from '../mutations'
import { errorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'

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
 * Création d'une SOUS-catégorie de parc : nom + modèle de site OPTIONNEL.
 * - Avec modèle → tous les équipements créés dedans en seront des copies (flotte
 *   homogène).
 * - Sans modèle → équipements SPÉCIFIQUES saisis à la main (comme les opérations
 *   spécifiques ; rien ne va dans la Bibliothèque).
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
  const [modeleId, setModeleId] = useState('')
  const [errors, setErrors] = useState<{ nom?: string }>({})

  async function handleSubmit() {
    if (!nom.trim()) {
      setErrors({ nom: 'Le nom est obligatoire' })
      return
    }
    setErrors({})
    try {
      await create.mutateAsync({
        nom,
        parentId,
        siteId,
        modeleId: modeleId || null,
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
      description="Avec un modèle, les équipements en seront des copies ; sans modèle, tu les saisis à la main (équipements spécifiques)."
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={create.isPending}
    >
      <TextField
        label="Nom"
        value={nom}
        onChange={setNom}
        error={errors.nom}
        required
      />
      <SelectField
        label="Modèle (optionnel)"
        id="parc_subcat_modele"
        value={modeleId}
        onChange={setModeleId}
      >
        <option value="">— Aucun (équipements spécifiques) —</option>
        {modeles.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nom}
          </option>
        ))}
      </SelectField>
    </FormDialog>
  )
}
