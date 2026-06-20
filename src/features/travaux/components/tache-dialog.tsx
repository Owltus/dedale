import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { tacheSchema, emptyTache } from '../schemas'
import type { TacheFormValues } from '../schemas'
import { useCreateTache, useUpdateTache } from '../mutations'
import type { TacheItem } from './tache-row'
import { useAuth } from '@/auth'
import { equipementsQueries } from '@/features/equipements/queries'
import { EmplacementSelect } from '@/features/equipements/components/emplacement-select'
import { writeErrorMessage, fieldErrors } from '@/lib/form'
import { FormDialog } from '@/components/common/form-dialog'
import { SelectField } from '@/components/common/select-field'

interface TacheDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  travauxId: string
  siteId: string
  /** Zone à MODIFIER (local/équipement). Absent = ajout d'une nouvelle zone. */
  tache?: TacheItem | null
}

/**
 * Ajout OU modification d'une ZONE concernée par un travail : un local REQUIS
 * (cascade Niveau → Local) et, le cas échéant, un équipement DE CE LOCAL
 * (optionnel). En création le statut initial est « En attente » (défaut backend) ;
 * il se change ensuite sur la fiche. L'édition ne touche QUE le local/équipement
 * (le statut reste géré en ligne sur la ligne de zone).
 */
export function TacheDialog({
  open,
  onOpenChange,
  travauxId,
  siteId,
  tache,
}: TacheDialogProps) {
  const isEdit = Boolean(tache)
  const { session } = useAuth()
  const create = useCreateTache()
  const update = useUpdateTache()
  const pending = create.isPending || update.isPending
  const { data: equipements = [] } = useQuery(equipementsQueries.list(siteId))

  const [values, setValues] = useState<TacheFormValues>(() =>
    tache
      ? { local_id: tache.local_id, equipement_id: tache.equipement_id ?? '' }
      : emptyTache(),
  )
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
    try {
      if (tache) {
        await update.mutateAsync({
          id: tache.id,
          travauxId,
          values: parsed.data,
        })
        toast.success('Zone modifiée')
      } else {
        if (!session) {
          toast.error('Session expirée, reconnecte-toi.')
          return
        }
        await create.mutateAsync({
          travauxId,
          createdBy: session.user.id,
          values: parsed.data,
        })
        toast.success('Zone ajoutée')
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Modifier la zone' : 'Ajouter une zone'}
      description="Choisis le local concerné et, si besoin, l'équipement précis."
      onSubmit={() => void handleSubmit()}
      submitLabel={isEdit ? 'Enregistrer' : 'Ajouter'}
      pendingLabel={isEdit ? 'Enregistrement…' : 'Ajout…'}
      pending={pending}
    >
      <EmplacementSelect
        siteId={siteId}
        value={values.local_id}
        onChange={setLocal}
        error={errors.local_id}
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
