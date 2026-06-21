import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { demandesQueries } from '../queries'
import { useUpdateDemande } from '../mutations'
import { LocalSearchSelect } from '@/features/equipements/components/local-search-select'
import { equipementsQueries } from '@/features/equipements/queries'
import { useCurrentRole } from '@/hooks/use-current-role'
import { writeErrorMessage } from '@/lib/form'
import * as perm from '@/lib/permissions'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'
import { SelectField } from '@/components/common/select-field'
import type { Database } from '@/lib/database.types'

type Demande = Database['public']['Tables']['demandes_intervention']['Row']

interface DiEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  demande: Demande | null
  siteId: string
}

/**
 * Modifier une demande d'intervention. Les CHAMPS dépendent du rôle (miroir RLS) :
 *  - admin / manager / technicien : constat + localisation + équipement. La RLS
 *    leur donne le plein pouvoir (FOR ALL) sur les liaisons → réconciliation OK.
 *  - demandeur : CONSTAT seul. Il n'a que SELECT/INSERT sur les liaisons (jamais
 *    DELETE/UPDATE) → on ne lui propose pas de les changer (sinon erreur 42501).
 *
 * Remonter ce dialog (via `key`) à chaque ouverture re-amorce le constat ; les
 * liaisons existantes sont pré-remplies une fois chargées (seed au rendu).
 */
export function DiEditDialog({
  open,
  onOpenChange,
  demande,
  siteId,
}: DiEditDialogProps) {
  const { data: role } = useCurrentRole()
  const canEditLiaisons = perm.canManageMetier(role)
  const update = useUpdateDemande()

  const diId = demande?.id ?? ''
  const enabled = open && canEditLiaisons && diId !== ''
  // Liaisons actuelles — chargées seulement pour les rôles qui peuvent les éditer.
  const locQ = useQuery({
    ...demandesQueries.localisations(diId),
    enabled,
  })
  const eqQ = useQuery({
    ...demandesQueries.equipements(diId),
    enabled,
  })
  const { data: equipements = [] } = useQuery({
    ...equipementsQueries.list(siteId),
    enabled: open && canEditLiaisons,
  })

  const [constat, setConstat] = useState(demande?.constat ?? '')
  const [localId, setLocalId] = useState('')
  const [equipementId, setEquipementId] = useState('')
  const [error, setError] = useState('')

  // Pré-remplissage des liaisons une fois chargées : pattern officiel « ajuster
  // l'état pendant le rendu » (état `seeded`, pas un ref) → seed unique. Le `key`
  // du parent garantit un montage neuf par demande, donc un re-seed à chaque édition.
  const [seeded, setSeeded] = useState(false)
  if (canEditLiaisons && !seeded && locQ.isSuccess && eqQ.isSuccess) {
    setSeeded(true)
    setLocalId(locQ.data[0]?.local_id ?? '')
    setEquipementId(eqQ.data[0]?.equipement_id ?? '')
  }

  // Équipements du lieu choisi (le champ équipement se limite à ce lieu).
  const equipementsDuLocal = useMemo(
    () =>
      localId === '' ? [] : equipements.filter((e) => e.local_id === localId),
    [equipements, localId],
  )

  if (!demande) return null

  // Changer de lieu réinitialise l'équipement (il doit appartenir au lieu).
  function setLocal(id: string) {
    setLocalId(id)
    setEquipementId('')
  }

  function editConstat(value: string) {
    setConstat(value)
    if (error) setError('')
  }

  async function handleSubmit() {
    if (constat.trim() === '') {
      setError('Le constat est obligatoire')
      return
    }
    setError('')
    try {
      await update.mutateAsync({
        id: demande!.id,
        constat,
        liaisons: canEditLiaisons ? { localId, equipementId } : null,
      })
      toast.success('Demande modifiée')
      onOpenChange(false)
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier la demande"
      onSubmit={() => void handleSubmit()}
      submitLabel="Enregistrer"
      pendingLabel="Enregistrement…"
      pending={update.isPending}
    >
      <TextareaField
        id="di-edit-constat"
        label="Constat"
        required
        rows={5}
        value={constat}
        onChange={editConstat}
        error={error}
      />

      {canEditLiaisons && (
        <>
          <LocalSearchSelect
            siteId={siteId}
            label="Localisation"
            value={localId}
            onChange={setLocal}
          />
          <SelectField
            id="di-edit-equipement"
            label="Équipement"
            value={equipementId}
            onChange={setEquipementId}
            disabled={localId === ''}
          >
            <option value="">Aucun</option>
            {equipementsDuLocal.map((eq) => (
              <option key={eq.id ?? ''} value={eq.id ?? ''}>
                {eq.nom}
              </option>
            ))}
          </SelectField>
        </>
      )}
    </FormDialog>
  )
}
