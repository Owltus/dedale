import { useEffect, useRef } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { demandesQueries } from '../queries'
import { useUpdateDemande } from '../mutations'
import { diEditSchema } from '../schemas'
import type { DiEditFormValues } from '../schemas'
import { LocalEquipementFields } from '@/features/equipements/components/local-equipement-fields'
import { LocalSearchSelect } from '@/features/equipements/components/local-search-select'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import * as perm from '@/lib/permissions'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { TextareaField } from '@/components/common/fields/textarea-field'
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
 * liaisons existantes sont pré-remplies une fois chargées (seed au montage).
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

  const form = useForm<DiEditFormValues>({
    resolver: zodResolver(diEditSchema),
    defaultValues: {
      constat: demande?.constat ?? '',
      local_id: '',
      equipement_id: '',
    },
  })
  const submit = useSubmitDialog<DiEditFormValues>({
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

  // La cascade Localisation → Équipement est pilotée par un composant impératif
  // (value/onChange) : on lit l'état RHF via `useWatch` et on l'écrit via `setValue`.
  const localId = useWatch({ control: form.control, name: 'local_id' })
  const equipementId = useWatch({
    control: form.control,
    name: 'equipement_id',
  })

  // Pré-remplissage des liaisons une fois chargées (rôles métier seulement) : seed
  // UNIQUE gardé par `seeded` → ne réécrit jamais une saisie en cours. Le `key` du
  // parent garantit un montage neuf par demande, donc un re-seed à chaque édition.
  // En RHF, `setValue` se fait HORS rendu (effet), jamais pendant.
  const seeded = useRef(false)
  useEffect(() => {
    if (canEditLiaisons && !seeded.current && locQ.isSuccess && eqQ.isSuccess) {
      seeded.current = true
      form.setValue('local_id', locQ.data[0]?.local_id ?? '')
      form.setValue('equipement_id', eqQ.data[0]?.equipement_id ?? '')
    }
  }, [
    canEditLiaisons,
    locQ.isSuccess,
    eqQ.isSuccess,
    locQ.data,
    eqQ.data,
    form,
  ])

  if (!demande) return null

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Modifier la demande"
        description="Corrigez le constat et, selon vos droits, la localisation ou l'équipement."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Enregistrer"
        pendingLabel="Enregistrement…"
        pending={form.formState.isSubmitting}
      >
        {/* Ordre calqué sur le modal de création : cascade Localisation → Équipement,
            puis Constat. Cascade réservée aux rôles métier (RLS). */}
        {canEditLiaisons && (
          <LocalEquipementFields
            siteId={siteId}
            localId={localId}
            equipementId={equipementId}
            onChange={({ localId, equipementId }) => {
              form.setValue('local_id', localId)
              form.setValue('equipement_id', equipementId)
            }}
            errors={{
              local_id: form.formState.errors.local_id?.message,
              equipement_id: form.formState.errors.equipement_id?.message,
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
          control={form.control}
          name="constat"
          label="Constat"
          required
          rows={5}
          placeholder="Ex. éclairage du 2ᵉ étage à remplacer"
        />
      </FormDialog>
    </Form>
  )
}
