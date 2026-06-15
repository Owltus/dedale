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
 * Création d'une SOUS-catégorie de parc : nom + modèle de site FIXÉ (obligatoire).
 * Tous les équipements créés dans cette sous-catégorie seront des copies de ce
 * modèle (flotte homogène). Si aucun modèle de site n'existe, on l'indique et la
 * création est bloquée (créer/exporter un modèle dans la Bibliothèque d'abord).
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
  const [errors, setErrors] = useState<{ nom?: string; modele?: string }>({})
  const aucunModele = modeles.length === 0

  async function handleSubmit() {
    const next: { nom?: string; modele?: string } = {}
    if (!nom.trim()) next.nom = 'Le nom est obligatoire'
    if (!modeleId) next.modele = 'Choisis un modèle'
    if (next.nom || next.modele) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await create.mutateAsync({ nom, parentId, siteId, modeleId })
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
      description="Choisis le modèle dont hériteront tous les équipements de cette sous-catégorie."
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={create.isPending}
      submitDisabled={aucunModele}
    >
      <TextField
        label="Nom"
        value={nom}
        onChange={setNom}
        error={errors.nom}
        required
      />
      <SelectField
        label="Modèle de la sous-catégorie"
        required
        id="parc_subcat_modele"
        value={modeleId}
        onChange={setModeleId}
        error={errors.modele}
      >
        <option value="">— Choisir un modèle du site —</option>
        {modeles.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nom}
          </option>
        ))}
      </SelectField>
      {aucunModele && (
        <p className="text-muted-foreground text-sm">
          Aucun modèle sur ce site. Crée un modèle dans la Bibliothèque (ou
          exporte un modèle commun vers le site), puis reviens ici.
        </p>
      )}
    </FormDialog>
  )
}
