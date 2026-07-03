import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { demandesQueries } from '../queries'
import { useUpdateDemande } from '../mutations'
import { diEditSchema } from '../schemas'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { LocalSearchSelect } from '@/features/equipements/components/local-search-select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useFormDialog } from '@/hooks/use-form-dialog'
import * as perm from '@/lib/permissions'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/textarea-field'
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

  const form = useFormDialog({
    schema: diEditSchema,
    initialValues: () => ({
      constat: demande?.constat ?? '',
      local_id: '',
      equipement_id: '',
    }),
    onSubmit: (data) =>
      update.mutateAsync({
        id: demande!.id,
        constat: data.constat,
        // Rôle métier → réconciliation des liaisons ; demandeur → on n'y touche pas.
        liaisons: canEditLiaisons
          ? { localId: data.local_id, equipementId: data.equipement_id }
          : null,
      }),
    successMessage: 'Demande modifiée',
    close: () => onOpenChange(false),
  })

  // Pré-remplissage des liaisons une fois chargées : pattern officiel « ajuster
  // l'état pendant le rendu » (état `seeded`, pas un ref) → seed unique. Le `key`
  // du parent garantit un montage neuf par demande, donc un re-seed à chaque édition.
  const [seeded, setSeeded] = useState(false)
  if (canEditLiaisons && !seeded && locQ.isSuccess && eqQ.isSuccess) {
    setSeeded(true)
    form.setValues((v) => ({
      ...v,
      local_id: locQ.data[0]?.local_id ?? '',
      equipement_id: eqQ.data[0]?.equipement_id ?? '',
    }))
  }

  if (!demande) return null

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Modifier la demande"
      onSubmit={() => void form.submit()}
      submitLabel="Enregistrer"
      pendingLabel="Enregistrement…"
      pending={form.pending}
    >
      {/* Ordre calqué sur le modal de création : cascade Localisation → Équipement,
          puis Constat. Cascade réservée aux rôles métier (RLS). */}
      {canEditLiaisons && (
        <LocalEquipementFields
          siteId={siteId}
          localId={form.values.local_id}
          equipementId={form.values.equipement_id}
          onChange={({ localId, equipementId }) =>
            form.setValues((v) => ({
              ...v,
              local_id: localId,
              equipement_id: equipementId,
            }))
          }
          errors={{
            local_id: form.errors.local_id,
            equipement_id: form.errors.equipement_id,
          }}
          equipementSelectId="di-edit-equipement"
          renderLieu={(p) => (
            <LocalSearchSelect
              siteId={p.siteId}
              label="Localisation"
              value={p.value}
              onChange={p.onChange}
            />
          )}
        />
      )}

      <TextareaField
        id="di-edit-constat"
        label="Constat"
        required
        rows={5}
        value={form.values.constat}
        onChange={(v) => form.set('constat', v)}
        error={form.errors.constat}
      />
    </FormDialog>
  )
}
