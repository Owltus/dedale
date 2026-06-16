import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateGabaritSpecifique } from '../mutations'
import { prepareChamps, type Champ } from '@/lib/champs'
import { errorMessage } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { ChampsListEditor } from '@/components/common/champs-list-editor'

interface ModifierCaracteristiquesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Sous-catégorie (gabarit spécifique) à modifier. */
  categorieId: string
  /** Caractéristiques actuelles du gabarit. */
  initialChamps: Champ[]
  /** Équipements de la sous-catégorie (mis à jour par propagation). */
  equipements: { id: string; specifications: unknown }[]
}

/**
 * ÉDITION EN MASSE des caractéristiques d'une sous-catégorie SPÉCIFIQUE : on ajuste
 * le gabarit (ajouter/retirer/modifier un champ) et, à l'enregistrement, TOUS les
 * équipements de la sous-catégorie sont mis à jour — les valeurs déjà saisies sont
 * conservées (par clé).
 */
export function ModifierCaracteristiquesDialog({
  open,
  onOpenChange,
  categorieId,
  initialChamps,
  equipements,
}: ModifierCaracteristiquesDialogProps) {
  const update = useUpdateGabaritSpecifique()
  const [champs, setChamps] = useState<Champ[]>(initialChamps)

  async function handleSubmit() {
    const prepared = prepareChamps(champs)
    if (!prepared.ok) {
      toast.error(prepared.error)
      return
    }
    try {
      await update.mutateAsync({
        categorieId,
        champs: prepared.champs,
        equipements,
      })
      toast.success('Caractéristiques mises à jour')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const n = equipements.length
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier les caractéristiques"
      description={
        n > 0
          ? `${String(n)} équipement${n > 1 ? 's' : ''} de cette sous-catégorie ${n > 1 ? 'seront mis' : 'sera mis'} à jour ; les valeurs déjà saisies sont conservées.`
          : 'Ajuste les caractéristiques héritées par les équipements de cette sous-catégorie.'
      }
      onSubmit={() => void handleSubmit()}
      submitLabel="Enregistrer"
      pendingLabel="Mise à jour…"
      pending={update.isPending}
      contentClassName="sm:max-w-2xl"
    >
      <ChampsListEditor champs={champs} onChange={setChamps} />
    </FormDialog>
  )
}
