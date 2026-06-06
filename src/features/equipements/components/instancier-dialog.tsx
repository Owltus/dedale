import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useInstancierEquipement } from '../mutations'
import { equipementsQueries } from '../queries'
import { errorMessage } from '@/lib/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'

interface InstancierDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  modeleId: string | null
  modeleNom: string | null
}

export function InstancierDialog({
  open,
  onOpenChange,
  siteId,
  modeleId,
  modeleNom,
}: InstancierDialogProps) {
  const instancier = useInstancierEquipement()
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const [localId, setLocalId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()

  async function handleSubmit() {
    if (!modeleId) return
    if (!localId) {
      setError('L’emplacement est obligatoire')
      return
    }
    setError(undefined)
    try {
      await instancier.mutateAsync({
        modeleId,
        localId,
        codeInventaire: code.trim(),
      })
      toast.success('Équipement créé depuis le modèle')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instancier le modèle</DialogTitle>
          <DialogDescription>
            {modeleNom
              ? `Crée un équipement à partir du modèle « ${modeleNom} ». Ses caractéristiques sont copiées.`
              : 'Crée un équipement à partir du modèle. Ses caractéristiques sont copiées.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <SelectField
            label="Emplacement"
            required
            id="instancier_local"
            value={localId}
            onChange={setLocalId}
            error={error}
          >
            <option value="">— Choisir un local —</option>
            {locaux.map((l) => (
              <option key={l.local_id ?? ''} value={l.local_id ?? ''}>
                {l.chemin_court ?? l.local_nom ?? ''}
              </option>
            ))}
          </SelectField>
          <TextField label="Code inventaire" value={code} onChange={setCode} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={instancier.isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={instancier.isPending}>
              {instancier.isPending ? 'Création…' : 'Instancier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
