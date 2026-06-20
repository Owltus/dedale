import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { tacheSchema, emptyTache } from '../schemas'
import type { TacheFormValues } from '../schemas'
import { useCreateTache } from '../mutations'
import { useAuth } from '@/auth'
import { equipementsQueries } from '@/features/equipements/queries'
import { EmplacementSelect } from '@/features/equipements/components/emplacement-select'
import { errorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextField } from '@/components/common/text-field'
import { SelectField } from '@/components/common/select-field'

interface TacheDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  travauxId: string
  siteId: string
}

/**
 * Ajout d'une tâche à un travail : un libellé, un local (cascade Niveau → Local,
 * FACULTATIF) et, le cas échéant, un équipement DE CE LOCAL (facultatif). Le
 * statut initial est « En attente » (défaut backend) ; il se change ensuite sur
 * la fiche.
 */
export function TacheDialog({
  open,
  onOpenChange,
  travauxId,
  siteId,
}: TacheDialogProps) {
  const { session } = useAuth()
  const create = useCreateTache()
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))

  const [values, setValues] = useState<TacheFormValues>(emptyTache)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Équipements DU LOCAL choisi (sinon liste vide → sélecteur désactivé).
  const equipementsDuLocal = useMemo(
    () =>
      values.local_id === ''
        ? []
        : equipements.filter((e) => e.local_id === values.local_id),
    [equipements, values.local_id],
  )

  // Choisir un local réinitialise l'équipement (il doit appartenir au local).
  function setLocal(localId: string) {
    setValues((v) => ({ ...v, local_id: localId, equipement_id: '' }))
  }

  async function handleSubmit() {
    const parsed = tacheSchema.safeParse(values)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    if (!session) {
      toast.error('Session expirée, reconnecte-toi.')
      return
    }
    try {
      await create.mutateAsync({
        travauxId,
        createdBy: session.user.id,
        values: parsed.data,
      })
      toast.success('Tâche ajoutée')
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ajouter une tâche"
      description="Décris la tâche et, si besoin, le local et l'équipement concernés."
      onSubmit={() => void handleSubmit()}
      submitLabel="Ajouter"
      pendingLabel="Ajout…"
      pending={create.isPending}
    >
      <TextField
        label="Libellé"
        value={values.libelle}
        onChange={(libelle) => setValues((v) => ({ ...v, libelle }))}
        error={errors.libelle}
        required
      />

      <EmplacementSelect
        siteId={siteId}
        value={values.local_id}
        onChange={setLocal}
        requiredEmplacement={false}
      />

      <SelectField
        label="Équipement concerné"
        value={values.equipement_id}
        onChange={(equipement_id) =>
          setValues((v) => ({ ...v, equipement_id }))
        }
        disabled={values.local_id === '' || equipementsDuLocal.length === 0}
      >
        <option value="">Aucun</option>
        {equipementsDuLocal.map((e) => (
          <option key={e.id ?? ''} value={e.id ?? ''}>
            {e.nom}
          </option>
        ))}
      </SelectField>
    </FormDialog>
  )
}
