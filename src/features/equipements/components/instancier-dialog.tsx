import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useInstancierEquipement } from '../mutations'
import { equipementsQueries } from '../queries'
import { errorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'

interface InstancierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Modèle imposé (instanciation d'un modèle précis). */
  modeleId?: string | null
  /** Nom du modèle imposé (pour le texte d'aide). */
  modeleNom?: string | null
  /**
   * Liste de modèles à CHOISIR (« Créer depuis un modèle ») : si fournie ET sans
   * `modeleId`, un sélecteur de modèle est affiché. La création produit un
   * équipement AUTONOME (caractéristiques copiées), indépendant de son modèle.
   */
  modeles?: { id: string; nom: string }[]
  /** Catégorie de PARC où ranger l'équipement créé (la sous-catégorie courante). */
  categorieId?: string | null
}

export function InstancierDialog({
  open,
  onOpenChange,
  siteId,
  modeleId,
  modeleNom,
  modeles,
  categorieId,
}: InstancierDialogProps) {
  const instancier = useInstancierEquipement()
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  // Sélecteur de modèle uniquement quand une liste est fournie sans modèle imposé.
  const pickModele = modeleId == null && modeles !== undefined
  const [modeleChoisi, setModeleChoisi] = useState('')
  const [localId, setLocalId] = useState('')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<{ modele?: string; local?: string }>({})

  const effectiveModeleId = modeleId ?? (modeleChoisi || null)

  async function handleSubmit() {
    const next: { modele?: string; local?: string } = {}
    if (!effectiveModeleId) next.modele = 'Le modèle est obligatoire'
    if (!localId) next.local = 'L’emplacement est obligatoire'
    if (next.modele || next.local) {
      setErrors(next)
      return
    }
    setErrors({})
    try {
      await instancier.mutateAsync({
        modeleId: effectiveModeleId!,
        localId,
        codeInventaire: code.trim(),
        categorieId,
      })
      toast.success('Équipement créé depuis le modèle')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Créer depuis un modèle"
      description={
        modeleNom
          ? `Crée un équipement à partir du modèle « ${modeleNom} ». Ses caractéristiques sont copiées ; l’équipement est ensuite indépendant.`
          : 'Crée un équipement à partir d’un modèle. Ses caractéristiques sont copiées ; l’équipement est ensuite indépendant.'
      }
      onSubmit={() => void handleSubmit()}
      submitLabel="Créer"
      pendingLabel="Création…"
      pending={instancier.isPending}
    >
      {pickModele && (
        <SelectField
          label="Modèle"
          required
          id="instancier_modele"
          value={modeleChoisi}
          onChange={setModeleChoisi}
          error={errors.modele}
        >
          <option value="">— Choisir un modèle —</option>
          {modeles.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nom}
            </option>
          ))}
        </SelectField>
      )}
      <SelectField
        label="Emplacement"
        required
        id="instancier_local"
        value={localId}
        onChange={setLocalId}
        error={errors.local}
      >
        <option value="">— Choisir un local —</option>
        {locaux.map((l) => (
          <option key={l.local_id ?? ''} value={l.local_id ?? ''}>
            {l.chemin_court ?? l.local_nom ?? ''}
          </option>
        ))}
      </SelectField>
      <TextField label="Code inventaire" value={code} onChange={setCode} />
    </FormDialog>
  )
}
