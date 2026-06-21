import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { demandesQueries } from './queries'
import type { DiFormValues } from './schemas'

export function useCreateDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: DiFormValues
    }) => {
      // 1. Insertion de la DI (statut Ouverte forcé par défaut/trigger serveur).
      const { data } = await supabase
        .from('demandes_intervention')
        .insert({
          site_id: siteId,
          created_by: createdBy,
          constat: values.constat.trim(),
          date_constat: values.date_constat,
        })
        .select()
        .single()
        .throwOnError()

      // 2. Liaisons optionnelles (le local/équipement doivent appartenir au site,
      //    contrôlé par trigger côté serveur).
      if (values.local_id) {
        await supabase
          .from('di_localisations')
          .insert({ di_id: data.id, local_id: values.local_id })
          .throwOnError()
      }
      if (values.equipement_id) {
        await supabase
          .from('di_equipements')
          .insert({ di_id: data.id, equipement_id: values.equipement_id })
          .throwOnError()
      }
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}

export function useResolveDemande() {
  const qc = useQueryClient()
  return useMutation({
    // Passage en Résolue (statut id=2). resolved_by + date_resolution sont
    // forcés serveur (triggers) → on ne les envoie pas. Une transition interdite
    // (statut terminal, etc.) renvoie une erreur Postgres à catcher côté appelant.
    mutationFn: async ({
      id,
      descriptionResolution,
    }: {
      id: string
      descriptionResolution: string
    }) => {
      const { data } = await supabase
        .from('demandes_intervention')
        .update({
          statut_di_id: 2,
          description_resolution: descriptionResolution.trim(),
        })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}

export function useReopenDemande() {
  const qc = useQueryClient()
  return useMutation({
    // Réouverture (statut id=3). resolved_by + date_resolution effacés serveur.
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .from('demandes_intervention')
        .update({ statut_di_id: 3 })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}
