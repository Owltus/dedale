import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ordresTravailQueries } from './queries'
import type { Database } from '@/lib/database.types'

type GammeNature = Database['public']['Enums']['gamme_nature']

/**
 * Crée un OT depuis une gamme.
 *
 * Mécanisme backend (vérifié dans schema_complete.sql) : il n'existe PAS de RPC
 * de création. On fait un INSERT direct dans `ordres_travail`. Trois triggers
 * BEFORE INSERT valident (validation_gamme_avec_operations : gamme active + au
 * moins une opération), puis le trigger AFTER INSERT `creation_ot_orchestrator`
 * appelle snapshot_ot_from_gamme / resolve_prestataire_for_ot /
 * generate_operations_execution — qui FIGENT les snapshots et génèrent les
 * operations_execution.
 *
 * Les colonnes snapshot NOT NULL (nom_gamme, nature_gamme, nom_prestataire,
 * libelle_periodicite) et prestataire_id sont obligatoires au niveau table mais
 * écrasées par le trigger AFTER INSERT. On envoie donc des valeurs « amorce »
 * issues de la gamme : valides à l'INSERT, immédiatement remplacées par le
 * snapshot officiel. On ne CHOISIT pas le prestataire effectif (résolu par
 * contrat côté backend).
 *
 * Anti-doublon : l'orchestrator (et l'index UNIQUE partiel
 * uq_ot_gamme_date_actifs) refuse un 2e OT actif sur la même gamme → on laisse
 * l'erreur Postgres remonter pour l'afficher proprement.
 */
export function useCreateOt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      siteId: string
      createdBy: string
      gammeId: string
      datePrevue: string
      // Valeurs « amorce » lues sur la gamme (écrasées par le trigger snapshot).
      nature: GammeNature
      prestataireId: string
      nomGamme: string
      libellePeriodicite: string
    }) => {
      const { data } = await supabase
        .from('ordres_travail')
        .insert({
          site_id: p.siteId,
          created_by: p.createdBy,
          gamme_id: p.gammeId,
          date_prevue: p.datePrevue,
          origine: 'planifie',
          // Amorces NOT NULL — remplacées par creation_ot_orchestrator.
          prestataire_id: p.prestataireId,
          nature_gamme: p.nature,
          nom_gamme: p.nomGamme,
          nom_prestataire: p.nomGamme,
          libelle_periodicite: p.libellePeriodicite,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ordresTravailQueries.all() }),
  })
}

/** Soft-delete d'un OT (corbeille 90j ; hard-delete interdit côté backend). */
export function useDeleteOt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('ordres_travail')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ordresTravailQueries.all() }),
  })
}

/**
 * Met à jour le statut d'un OT (transition manuelle : clôture, annulation,
 * résurrection). Le trigger validation_transitions_ot refuse les transitions
 * interdites et exige les motifs → on laisse l'erreur remonter.
 *
 * - cloture : nécessite date_cloture (CHECK statut_terminal_a_date_cloture).
 * - annule  : nécessite motif_annulation + date_cloture.
 * - planifie (résurrection depuis annule) : pas de champ supplémentaire.
 */
export function useChangerStatutOt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      id: string
      statut: 'cloture' | 'annule' | 'planifie'
      motifAnnulation?: string
    }) => {
      const patch: {
        statut: string
        date_cloture?: string
        motif_annulation?: string
      } = { statut: p.statut }

      if (p.statut === 'cloture' || p.statut === 'annule') {
        patch.date_cloture = new Date().toISOString()
      }
      if (p.statut === 'annule' && p.motifAnnulation !== undefined) {
        patch.motif_annulation = p.motifAnnulation.trim()
      }

      const { data } = await supabase
        .from('ordres_travail')
        .update(patch)
        .eq('id', p.id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ordresTravailQueries.all() }),
  })
}

/** Rouvre un OT clôturé via la RPC dédiée (seule voie supportée). */
export function useReouvrirOt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { id: string; motif: string }) => {
      const { data } = await supabase
        .rpc('reouvrir_ot', { p_ot_id: p.id, p_motif: p.motif.trim() })
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ordresTravailQueries.all() }),
  })
}

/**
 * Met à jour une opération d'exécution (saisie d'exécution).
 *
 * Le trigger gestion_statut_ot bascule AUTOMATIQUEMENT le statut de l'OT selon
 * l'état de ses opérations (planifie ↔ en_cours, clôture auto quand toutes les
 * ops sont terminales). On invalide donc aussi le détail de l'OT.
 *
 * Cohérence statut ↔ date_execution (CHECK statut_date_coherents) :
 *  - en_attente  → date_execution NULL
 *  - en_cours / terminee → date_execution NOT NULL
 *  - non_applicable → indifférent
 * On gère ces règles ici pour éviter une erreur CHECK.
 */
export function useUpdateOperationExecution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      id: string
      otId: string
      statut: string
      valeurMesuree: number | null
      dateExecution: string | null
      executedBy: string
      commentaires: string | null
    }) => {
      let dateExecution = p.dateExecution
      if (p.statut === 'en_attente') {
        dateExecution = null
      } else if (
        (p.statut === 'en_cours' || p.statut === 'terminee') &&
        !dateExecution
      ) {
        dateExecution = new Date().toISOString()
      }

      const { data } = await supabase
        .from('operations_execution')
        .update({
          statut: p.statut,
          valeur_mesuree: p.valeurMesuree,
          date_execution: dateExecution,
          executed_by: p.executedBy,
          commentaires: p.commentaires,
        })
        .eq('id', p.id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: (_data, p) => {
      // Le statut de l'OT a pu basculer (trigger) → invalider liste + détail + ops.
      void qc.invalidateQueries({ queryKey: ordresTravailQueries.all() })
      void qc.invalidateQueries({
        queryKey: ordresTravailQueries.operations(p.otId).queryKey,
      })
    },
  })
}
