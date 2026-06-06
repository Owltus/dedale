import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { emptyEquipement, equipementSchema } from '../schemas'
import type { EquipementFormValues } from '../schemas'
import { useCreateEquipement, useUpdateEquipement } from '../mutations'
import { equipementsQueries } from '../queries'
import { errorMessage, fieldErrors } from '@/lib/form'
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
import type { Database } from '@/lib/database.types'

type Equipement = Database['public']['Views']['v_equipements_complet']['Row']

interface EquipementFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  equipement?: Equipement | null
}

function initialValues(
  eq: Equipement | null | undefined,
): EquipementFormValues {
  if (!eq) return emptyEquipement
  return {
    nom: eq.nom ?? '',
    code_inventaire: eq.code_inventaire ?? '',
    categorie_id: eq.categorie_id ?? '',
    local_id: eq.local_id ?? '',
    date_mise_en_service: eq.date_mise_en_service ?? '',
    date_fin_garantie: eq.date_fin_garantie ?? '',
    commentaires: eq.commentaires ?? '',
  }
}

export function EquipementFormDialog({
  open,
  onOpenChange,
  siteId,
  equipement,
}: EquipementFormDialogProps) {
  const isEdit = Boolean(equipement)
  const create = useCreateEquipement()
  const update = useUpdateEquipement()
  const { data: categories = [] } = useQuery(
    equipementsQueries.categories(siteId),
  )
  const { data: locaux = [] } = useQuery(equipementsQueries.locaux(siteId))
  const [values, setValues] = useState<EquipementFormValues>(() =>
    initialValues(equipement),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const pending = create.isPending || update.isPending

  function set(key: keyof EquipementFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  async function handleSubmit() {
    const parsed = equipementSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      if (equipement?.id) {
        await update.mutateAsync({ id: equipement.id, values })
        toast.success('Équipement modifié')
      } else {
        await create.mutateAsync(values)
        toast.success('Équipement créé')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? 'Modifier l’équipement' : 'Nouvel équipement'}
          </DialogTitle>
          <DialogDescription>
            Renseigne les informations de l’équipement.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <TextField
            label="Nom"
            value={values.nom}
            onChange={(v) => set('nom', v)}
            error={errors.nom}
            required
          />
          <TextField
            label="Code inventaire"
            value={values.code_inventaire}
            onChange={(v) => set('code_inventaire', v)}
            error={errors.code_inventaire}
          />
          <SelectField
            label="Catégorie"
            id="categorie_id"
            value={values.categorie_id}
            onChange={(v) => set('categorie_id', v)}
          >
            <option value="">— Aucune —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Emplacement"
            required
            id="local_id"
            value={values.local_id}
            onChange={(v) => set('local_id', v)}
            error={errors.local_id}
          >
            <option value="">— Choisir un local —</option>
            {locaux.map((l) => (
              <option key={l.local_id ?? ''} value={l.local_id ?? ''}>
                {l.chemin_court ?? l.local_nom ?? ''}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              label="Mise en service"
              type="date"
              value={values.date_mise_en_service}
              onChange={(v) => set('date_mise_en_service', v)}
              error={errors.date_mise_en_service}
            />
            <TextField
              label="Fin de garantie"
              type="date"
              value={values.date_fin_garantie}
              onChange={(v) => set('date_fin_garantie', v)}
              error={errors.date_fin_garantie}
            />
          </div>
          <TextField
            label="Commentaires"
            value={values.commentaires}
            onChange={(v) => set('commentaires', v)}
            error={errors.commentaires}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
