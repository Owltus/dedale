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
      // 1. Insertion de la DI (statut Ouvert forcé par défaut/trigger serveur).
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
    // Clôture : passage en Clôturé (statut id=3). resolved_by + date_resolution
    // forcés serveur (triggers) → non envoyés. La note (description_resolution)
    // est obligatoire (validée serveur). Erreur Postgres catchée côté appelant.
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
          statut_di_id: 3,
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
    // Réouverture : retour à Ouvert (statut id=1). resolved_by + date_resolution
    // effacés serveur (la note de clôture est conservée à titre d'historique).
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .from('demandes_intervention')
        .update({ statut_di_id: 1 })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}

export function usePrendreEnCharge() {
  const qc = useQueryClient()
  return useMutation({
    // Prise en charge : passage en En cours (statut id=2). Pas de note.
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .from('demandes_intervention')
        .update({ statut_di_id: 2 })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}

export function useUpdateDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      constat,
      liaisons,
    }: {
      id: string
      constat: string
      // `null` → on NE touche PAS aux liaisons. Cas du DEMANDEUR : la RLS ne lui
      // donne que SELECT/INSERT sur di_localisations/di_equipements (jamais
      // DELETE/UPDATE) → un delete-réinsert échouerait. Il n'édite que le constat.
      // Renseigné → réconciliation complète (admin/manager/technicien : FOR ALL).
      liaisons: { localId: string; equipementId: string } | null
    }) => {
      // 1. Constat (RLS : manager/tech sur le site, demandeur sur SA DI Ouverte).
      //    .select('id').single() → un refus RLS (0 ligne) devient une vraie erreur.
      await supabase
        .from('demandes_intervention')
        .update({ constat: constat.trim() })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()

      if (liaisons === null) return

      // 2. Réconciliation des liaisons : on remet à plat puis on réinsère la
      //    sélection courante (au plus une localisation + un équipement ici).
      await supabase
        .from('di_localisations')
        .delete()
        .eq('di_id', id)
        .throwOnError()
      if (liaisons.localId) {
        await supabase
          .from('di_localisations')
          .insert({ di_id: id, local_id: liaisons.localId })
          .throwOnError()
      }
      await supabase
        .from('di_equipements')
        .delete()
        .eq('di_id', id)
        .throwOnError()
      if (liaisons.equipementId) {
        await supabase
          .from('di_equipements')
          .insert({ di_id: id, equipement_id: liaisons.equipementId })
          .throwOnError()
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}

export function useDeleteDemande() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Hard-delete. CASCADE nettoie di_localisations / di_equipements /
      // documents_di. .select('id').single() → un refus RLS (0 ligne) devient une
      // vraie erreur plutôt qu'un faux succès silencieux.
      await supabase
        .from('demandes_intervention')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}
