import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { chantiersQueries } from './queries'
import type { ChantierFormValues } from './schemas'

// Convertit les champs du formulaire en payload base (vides → null).
function toPayload(v: ChantierFormValues) {
  return {
    titre: v.titre.trim(),
    description: v.description.trim() || null,
    prestataire_id: v.prestataire_id || null,
    date_demande: v.date_demande,
    date_prevue: v.date_prevue || null,
    date_fin: v.date_fin || null,
  }
}

/** Remplace les liaisons locaux/équipements d'un chantier (delete-all puis insert). */
async function syncLiaisons(
  chantierId: string,
  localIds: string[],
  equipementIds: string[],
) {
  await supabase
    .from('chantier_localisations')
    .delete()
    .eq('chantier_id', chantierId)
    .throwOnError()
  await supabase
    .from('chantier_equipements')
    .delete()
    .eq('chantier_id', chantierId)
    .throwOnError()

  if (localIds.length > 0) {
    await supabase
      .from('chantier_localisations')
      .insert(
        localIds.map((local_id) => ({ chantier_id: chantierId, local_id })),
      )
      .throwOnError()
  }
  if (equipementIds.length > 0) {
    await supabase
      .from('chantier_equipements')
      .insert(
        equipementIds.map((equipement_id) => ({
          chantier_id: chantierId,
          equipement_id,
        })),
      )
      .throwOnError()
  }
}

export function useCreateChantier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: ChantierFormValues
    }) => {
      const { data } = await supabase
        .from('interventions_chantier')
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
    onSuccess: () => qc.invalidateQueries({ queryKey: chantiersQueries.all() }),
  })
}

export function useUpdateChantier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: ChantierFormValues
    }) => {
      const { data } = await supabase
        .from('interventions_chantier')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      await syncLiaisons(id, values.local_ids, values.equipement_ids)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chantiersQueries.all() }),
  })
}

export function useDeleteChantier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete : on pose deleted_at (côté backend).
      await supabase
        .from('interventions_chantier')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chantiersQueries.all() }),
  })
}

/**
 * Transition d'état via UPDATE du statut_chantier_id. Le passage « Terminé »
 * exige un compte_rendu : il est envoyé avec le changement. Le trigger backend
 * force cloture_by / date_fin et refuse une transition interdite — on laisse
 * l'erreur remonter pour l'afficher.
 */
export function useChangeStatutChantier() {
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
      const patch: { statut_chantier_id: number; compte_rendu?: string } = {
        statut_chantier_id: statutId,
      }
      if (compteRendu !== undefined) {
        patch.compte_rendu = compteRendu.trim()
      }
      const { data } = await supabase
        .from('interventions_chantier')
        .update(patch)
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chantiersQueries.all() }),
  })
}
