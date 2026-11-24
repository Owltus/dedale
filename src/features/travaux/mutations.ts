import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { travauxQueries } from './queries'
import { evenementsQueries } from '../evenements/queries'
import { STATUT_TERMINE } from './schemas'
import type { TravauxFormValues, TacheFormValues, StatutTache } from './schemas'
import type { TacheEntree } from '@/features/taches/components/taches-multiples-field'
import {
  diffTaches,
  tachesACreer,
  type TacheExistante,
} from '@/features/taches/taches-sync'

// Convertit les champs du formulaire en payload base (vides → null).
// `date_demande` est désormais saisissable (symétrie Événements, retour
// utilisateur : rattrapage d'historique) ; `date_fin` reste posée par le
// trigger/dialogue de clôture, jamais ici.
function toPayload(v: TravauxFormValues) {
  return {
    titre: v.titre.trim(),
    description: v.description.trim() || null,
    date_demande: v.date_demande,
    local_id: v.local_id || null,
    equipement_id: v.equipement_id || null,
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

      // Tâches ajoutées directement à la création (facultatif).
      const taches = tachesACreer(values.taches)
      if (taches.length) {
        await supabase
          .from('travaux_taches')
          .insert(
            taches.map((c) => ({
              travaux_id: data.id,
              ...c,
              created_by: createdBy,
            })),
          )
          .throwOnError()
      }

      return data
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: travauxQueries.all() })
      void qc.invalidateQueries({
        queryKey: travauxQueries.taches(data.id).queryKey,
      })
    },
  })
}

/**
 * `taches`/`existants` sont FACULTATIFS : les autres appelants (changement de
 * statut ailleurs dans l'app, s'il y en avait) ne touchent pas aux tâches.
 * Quand fournis (formulaire de modification), les tâches sont resynchronisées
 * par DIFF sur `id` (D11, 090) — jamais par delete-all/insert-all, qui aurait
 * remis chaque tâche conservée à « en attente » à chaque enregistrement, même
 * sans y toucher (son statut d'avancement n'existe QUE dans cette ligne).
 * Comparer par `local_id` (avant 090) ne suffit plus dès qu'une tâche peut
 * n'avoir AUCUN lieu — plusieurs tâches sans lieu seraient sinon indistinguables.
 */
export function useUpdateTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      taches,
      createdBy,
      existants,
    }: {
      id: string
      values: TravauxFormValues
      taches?: TacheEntree[]
      createdBy?: string
      existants?: TacheExistante[]
    }) => {
      const { data } = await supabase
        .from('interventions_travaux')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()

      if (taches && existants && createdBy) {
        const { aSupprimer, aAjouter, aModifier } = diffTaches(
          taches,
          existants,
        )
        if (aSupprimer.length) {
          await supabase
            .from('travaux_taches')
            .delete()
            .in('id', aSupprimer)
            .throwOnError()
        }
        if (aAjouter.length) {
          await supabase
            .from('travaux_taches')
            .insert(
              aAjouter.map((c) => ({
                travaux_id: id,
                ...c,
                created_by: createdBy,
              })),
            )
            .throwOnError()
        }
        for (const m of aModifier) {
          await supabase
            .from('travaux_taches')
            .update(m.champs)
            .eq('id', m.id)
            .throwOnError()
        }
      }

      return data
    },
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: travauxQueries.all() })
      void qc.invalidateQueries({
        queryKey: travauxQueries.taches(data.id).queryKey,
      })
    },
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
 * Transition d'état via UPDATE du statut_travaux_id. 085 : plus de machine à
 * états côté base (statut libre, comme les événements) — `cloture_by`/
 * `date_fin`/`compte_rendu` sont posés ICI par le front (l'ancien trigger
 * `set_travaux_cloture_by` a été supprimé), miroir exact de
 * `useChangeStatutEvenement`. En sortant de « Terminé », les trois champs
 * sont effacés (un travaux rouvert n'est plus clos).
 */
export function useChangeStatutTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statutId,
      compteRendu,
      dateFin,
      clotureBy,
    }: {
      id: string
      statutId: number
      compteRendu?: string
      dateFin?: string
      clotureBy?: string
    }) => {
      const cloture = statutId === STATUT_TERMINE
      const { data } = await supabase
        .from('interventions_travaux')
        .update({
          statut_travaux_id: statutId,
          compte_rendu: cloture ? (compteRendu?.trim() ?? '') || null : null,
          date_fin: cloture ? (dateFin ?? null) : null,
          cloture_by: cloture ? (clotureBy ?? null) : null,
          // 094 : toute clôture (à la main ou après confirmation d'une
          // clôture déclenchée automatiquement par les tâches) verrouille la
          // fiche ; une réouverture la déverrouille dans le même geste.
          verrouille: cloture,
        })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}

/**
 * CORRIGE une clôture déjà enregistrée : date de fin et/ou compte-rendu, sans
 * toucher au statut. Ne passe pas par `useChangeStatutTravaux` pour ne pas
 * réécrire `statut_travaux_id` à sa propre valeur (pas de trigger à réveiller
 * depuis 085, mais garde la même distinction que le patron Événements).
 */
export function useUpdateClotureTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dateFin,
      compteRendu,
    }: {
      id: string
      dateFin: string
      compteRendu: string
    }) => {
      const { data } = await supabase
        .from('interventions_travaux')
        .update({ date_fin: dateFin, compte_rendu: compteRendu.trim() || null })
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}

/**
 * Verrou anti-erreur (094) : une fiche clôturée (à la main ou automatiquement
 * depuis ses tâches) se verrouille — plus aucune modification (tâches
 * comprises) tant qu'elle n'est pas déverrouillée ICI, explicitement. Ne
 * touche à rien d'autre : redonner la main à `gestion_statut_travaux` (qui
 * recalculera le statut au prochain changement de tâche) est un effet, pas
 * une action de cette mutation.
 */
export function useToggleVerrouTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      verrouille,
    }: {
      id: string
      verrouille: boolean
    }) => {
      await supabase
        .from('interventions_travaux')
        .update({ verrouille })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: travauxQueries.all() }),
  })
}

// ─── Tâches (checklist à statut, 090) ─────────────────────────────────────────

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
          libelle: values.libelle.trim(),
          local_id: values.local_id || null,
          equipement_id: values.equipement_id || null,
          commentaire: values.commentaire.trim() || null,
          date_tache: values.date_tache || null,
          created_by: createdBy,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: travauxQueries.taches(vars.travauxId).queryKey,
      }),
  })
}

/** Modifie le libellé, le lieu et/ou le commentaire d'une tâche existante (pas son statut). */
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
          libelle: values.libelle.trim(),
          local_id: values.local_id || null,
          equipement_id: values.equipement_id || null,
          commentaire: values.commentaire.trim() || null,
          date_tache: values.date_tache || null,
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
      qc.invalidateQueries({
        queryKey: travauxQueries.taches(vars.travauxId).queryKey,
      }),
  })
}

/** Modifie la date d'une tâche, éditable EN LIGNE comme le statut (093). */
export function useUpdateTacheDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dateTache,
    }: {
      id: string
      travauxId: string
      dateTache: string
    }) => {
      await supabase
        .from('travaux_taches')
        .update({ date_tache: dateTache || null })
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
      qc.invalidateQueries({
        queryKey: travauxQueries.taches(vars.travauxId).queryKey,
      }),
  })
}

/** Réordonnancement par glisser-déposer (étape 5) : réécrit `ordre` selon le nouvel ordre visuel. */
export function useReordonnerTaches() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids }: { travauxId: string; ids: string[] }) => {
      await Promise.all(
        ids.map((id, ordre) =>
          supabase
            .from('travaux_taches')
            .update({ ordre })
            .eq('id', id)
            .throwOnError(),
        ),
      )
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: travauxQueries.taches(vars.travauxId).queryKey,
      }),
  })
}

/**
 * Convertit ce Travaux en Événement (copie + suppression du Travaux, RPC
 * `convertir_travaux_en_evenement`) : documents et TOUTES les zones
 * transférés, statut préservé (087). Retourne l'id du nouvel Événement (pour
 * rediriger dessus).
 */
export function useConvertirEnEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .rpc('convertir_travaux_en_evenement', { p_travaux_id: id })
        .throwOnError()
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: travauxQueries.all() })
      void qc.invalidateQueries({ queryKey: evenementsQueries.all() })
    },
  })
}
