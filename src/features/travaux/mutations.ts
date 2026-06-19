import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { travauxQueries } from './queries'
import type { TravauxFormValues } from './schemas'

// Convertit les champs du formulaire en payload base (vides → null).
function toPayload(v: TravauxFormValues) {
  return {
    titre: v.titre.trim(),
    description: v.description.trim() || null,
    prestataire_id: v.prestataire_id || null,
    date_demande: v.date_demande,
    date_prevue: v.date_prevue || null,
    date_fin: v.date_fin || null,
  }
}

/** Remplace les liaisons locaux/équipements d'un travaux (delete-all puis insert). */
async function syncLiaisons(
  travauxId: string,
  localIds: string[],
  equipementIds: string[],
) {
  await supabase
    .from('travaux_localisations')
    .delete()
    .eq('travaux_id', travauxId)
    .throwOnError()
  await supabase
    .from('travaux_equipements')
    .delete()
    .eq('travaux_id', travauxId)
    .throwOnError()

  if (localIds.length > 0) {
    await supabase
      .from('travaux_localisations')
      .insert(
        localIds.map((local_id) => ({ travaux_id: travauxId, local_id })),
      )
      .throwOnError()
  }
  if (equipementIds.length > 0) {
    await supabase
      .from('travaux_equipements')
      .insert(
        equipementIds.map((equipement_id) => ({
          travaux_id: travauxId,
          equipement_id,
        })),
      )
      .throwOnError()
  }
}

export function useCreateTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: TravauxFormValues
    }) => {
      const { data } = await supabase
        .from('interventions_travaux')
        .insert({
          ...toPayload(values),
          site_id: siteId,
          created_by: createdBy,
        })
        .select()
        .single()
        .throwOnError()
      await syncLiaisons(data.id, values.local_ids, values.equipement_ids)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}

export function useUpdateTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: TravauxFormValues
    }) => {
      const { data } = await supabase
        .from('interventions_travaux')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      await syncLiaisons(id, values.local_ids, values.equipement_ids)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}

export function useDeleteTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression définitive (hard-delete).
      await supabase
        .from('interventions_travaux')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}

/**
 * Transition d'état via UPDATE du statut_travaux_id. Le passage « Terminé »
 * exige un compte_rendu : il est envoyé avec le changement. Le trigger backend
 * force cloture_by / date_fin et refuse une transition interdite — on laisse
 * l'erreur remonter pour l'afficher.
 */
export function useChangeStatutTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statutId,
      compteRendu,
    }: {
      id: string
      statutId: number
      compteRendu?: string
    }) => {
      const patch: { statut_travaux_id: number; compte_rendu?: string } = {
        statut_travaux_id: statutId,
      }
      if (compteRendu !== undefined) {
        patch.compte_rendu = compteRendu.trim()
      }
      const { data } = await supabase
        .from('interventions_travaux')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}
