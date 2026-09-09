import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateTypeLocalGabarit } from '../mutations'
import { parseChamps, prepareChamps, type Champ } from '@/lib/champs'
import { writeErrorMessage } from '@/lib/form'
import { DialogShell } from '@/components/common/dialog-shell'
import { ChampsListEditor } from '@/components/common/champs-list-editor'
import { Button } from '@/components/ui/button'
import type { Database } from '@/lib/database.types'

type TypeLocal = Database['public']['Tables']['types_locaux']['Row']

interface TypeLocalGabaritDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: TypeLocal
  /** Nombre de locaux déjà rattachés à ce type (avertissement de suppression). */
  nbLocaux: number
}

/**
 * Édite le GABARIT de caractéristiques d'un type de local (ex. « Chambre
 * standard » → Nombre de lits, Vue, Balcon). Même mécanisme que le gabarit
 * d'une sous-catégorie d'équipements : la définition vit sur le type, les
 * VALEURS sur chaque local, qui en garde un snapshot. Réservé à l'admin (la
 * policy `types_locaux_admin_write` reste l'arbitre).
 */
export function TypeLocalGabaritDialog({
  open,
  onOpenChange,
  type,
  nbLocaux,
}: TypeLocalGabaritDialogProps) {
  const [champs, setChamps] = useState<Champ[]>(() =>
    parseChamps(type.specifications),
  )
  const update = useUpdateTypeLocalGabarit()

  // Enregistrement IMMÉDIAT à chaque modification de la liste (même contrat que
  // l'éditeur de gabarit d'une sous-catégorie existante) : l'éditeur ne porte
  // pas de brouillon, ce qui évite qu'une fermeture perde les champs ajoutés.
  async function handleChange(suivants: Champ[]) {
    const prepares = prepareChamps(suivants)
    if (!prepares.ok) {
      toast.error(prepares.error)
      return
    }
    const avant = champs
    setChamps(prepares.champs)
    try {
      await update.mutateAsync({ id: type.id, champs: prepares.champs })
    } catch (e) {
      setChamps(avant)
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={`Caractéristiques — ${type.libelle}`}
      description="Ces champs seront proposés à la saisie sur chaque local de ce type."
      size="lg"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Fermer
        </Button>
      }
    >
      <ChampsListEditor
        champs={champs}
        onChange={(c) => void handleChange(c)}
        pending={update.isPending}
        emptyHint="Aucune caractéristique. Ajoute des champs (ex. Nombre de lits, Vue, Degré coupe-feu…) ; ils s’enregistrent aussitôt et les locaux de ce type en hériteront."
        deleteImpactHint={
          nbLocaux > 0
            ? `Sa valeur sera aussi retirée de ${String(nbLocaux)} local${
                nbLocaux > 1 ? 'aux' : ''
              } de ce type lors de leur prochaine modification.`
            : undefined
        }
      />
    </DialogShell>
  )
}
