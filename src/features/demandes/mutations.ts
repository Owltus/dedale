import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { demandesQueries } from './queries'
import type { DiFormValues } from './schemas'
import { STATUT_DI_CLOTURE, STATUT_DI_EN_COURS, STATUT_DI_OUVERT } from './etat'

export function useCreateDemande() {
  const qc = useQueryClient()
  return useMutation({
    // UNE transaction (RPC creer_demande, 175) : la DI et ses liaisons
    // (local, équipement) sont écrites ensemble ou pas du tout — plus de DI
    // sans lieu après un échec au milieu. created_by = auth.uid() côté base ;
    // RLS et déclencheurs (site du local/équipement, synchro Dmbook) inchangés.
    mutationFn: async ({
      siteId,
      values,
    }: {
      siteId: string
      values: DiFormValues
    }) => {
      const { data } = await supabase
        .rpc('creer_demande', {
          p_site_id: siteId,
          p_constat: values.constat.trim(),
          p_date_constat: values.date_constat,
          p_local_id: values.local_id || undefined,
          p_equipement_id: values.equipement_id || undefined,
        })
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: demandesQueries.all() }),
  })
}

export function useCloturerDemande() {
  const qc = useQueryClient()
  return useMutation({
    // Clôture DIRECTE (statut id=3, SANS note — décision PO). resolved_by +
    // date_resolution sont forcés serveur (trigger). Erreur Postgres catchée
    // côté appelant.
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .from('demandes_intervention')
        .update({ statut_di_id: STATUT_DI_CLOTURE })
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
        .update({ statut_di_id: STATUT_DI_OUVERT })
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
        .update({ statut_di_id: STATUT_DI_EN_COURS })
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
      // DELETE/UPDATE) → une remise à plat échouerait. Il n'édite que le constat.
      // Renseigné → réconciliation complète (admin/manager/technicien : FOR ALL).
      liaisons: { localId: string; equipementId: string } | null
    }) => {
      // UNE transaction (RPC modifier_demande, 175) : constat + remise à plat
      // des liaisons ensemble. Hors périmètre (0 ligne) → 42501, même message
      // qu'avant (PGRST116).
      await supabase
        .rpc('modifier_demande', {
          p_id: id,
          p_constat: constat.trim(),
          p_liaisons: liaisons !== null,
          p_local_id: liaisons?.localId === '' ? undefined : liaisons?.localId,
          p_equipement_id:
            liaisons?.equipementId === '' ? undefined : liaisons?.equipementId,
        })
        .throwOnError()
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
