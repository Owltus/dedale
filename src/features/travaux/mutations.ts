import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { travauxQueries } from './queries'
import type { TravauxFormValues, TacheFormValues, StatutTache } from './schemas'

// Convertit les champs du formulaire en payload base (vides → null). Les dates
// ne sont plus saisies : date_demande prend son DEFAULT (date du jour) à
// l'insert, date_fin est posée par le trigger de clôture.
function toPayload(v: TravauxFormValues) {
  return {
    titre: v.titre.trim(),
    description: v.description.trim() || null,
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
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}

export function useDeleteTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression définitive (hard-delete) ; les tâches suivent en CASCADE.
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

// ─── Tâches (to-do à statut) ──────────────────────────────────────────────────

export function useCreateTache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      travauxId,
      createdBy,
      values,
    }: {
      travauxId: string
      createdBy: string
      values: TacheFormValues
    }) => {
      const { data } = await supabase
        .from('travaux_taches')
        .insert({
          travaux_id: travauxId,
          local_id: values.local_id,
          equipement_id: values.equipement_id || null,
          created_by: createdBy,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: travauxQueries.taches(vars.travauxId).queryKey }),
  })
}

/** Modifie le local et/ou l'équipement d'une zone existante (pas son statut). */
export function useUpdateTache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      travauxId: string
      values: TacheFormValues
    }) => {
      await supabase
        .from('travaux_taches')
        .update({
          local_id: values.local_id,
          equipement_id: values.equipement_id || null,
        })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: travauxQueries.taches(vars.travauxId).queryKey,
      }),
  })
}

export function useUpdateTacheStatut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statut,
    }: {
      id: string
      travauxId: string
      statut: StatutTache
    }) => {
      await supabase
        .from('travaux_taches')
        .update({ statut })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: travauxQueries.taches(vars.travauxId).queryKey }),
  })
}

export function useDeleteTache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; travauxId: string }) => {
      await supabase
        .from('travaux_taches')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: travauxQueries.taches(vars.travauxId).queryKey }),
  })
}
