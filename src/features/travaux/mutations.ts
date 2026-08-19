import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { travauxQueries } from './queries'
import { evenementsQueries } from '../evenements/queries'
import { STATUT_TERMINE } from './schemas'
import type { TravauxFormValues, TacheFormValues, StatutTache } from './schemas'
import type { TacheEntree } from '@/features/equipements/components/taches-multiples-field'

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

      // Tâches ajoutées directement à la création (facultatif) : une ligne
      // sans libellé NI lieu est ignorée (l'usager a pu ajouter puis
      // abandonner une ligne).
      const taches = values.taches.filter(
        (t) => t.libelle.trim() !== '' || t.local_id !== '',
      )
      if (taches.length) {
        await supabase
          .from('travaux_taches')
          .insert(
            taches.map((t, i) => ({
              travaux_id: data.id,
              libelle: t.libelle.trim() || 'Tâche',
              local_id: t.local_id || null,
              equipement_id: t.equipement_id || null,
              ordre: i,
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
      existants?: {
        id: string
        libelle: string
        local_id: string
        equipement_id: string
      }[]
    }) => {
      const { data } = await supabase
        .from('interventions_travaux')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()

      if (taches && existants && createdBy) {
        // Ligne réellement saisie : libellé ou lieu renseigné.
        const soumises = taches.filter(
          (t) => t.libelle.trim() !== '' || t.local_id !== '',
        )
        const existantsParId = new Map(existants.map((e) => [e.id, e]))
        const idsConserves = new Set(
          taches.filter((t) => t.id != null).map((t) => t.id!),
        )

        const aSupprimer = existants.filter((e) => !idsConserves.has(e.id))
        if (aSupprimer.length) {
          await supabase
            .from('travaux_taches')
            .delete()
            .in(
              'id',
              aSupprimer.map((e) => e.id),
            )
            .throwOnError()
        }

        const aAjouter = soumises.filter((t) => t.id == null)
        if (aAjouter.length) {
          await supabase
            .from('travaux_taches')
            .insert(
              aAjouter.map((t, i) => ({
                travaux_id: id,
                libelle: t.libelle.trim() || 'Tâche',
                local_id: t.local_id || null,
                equipement_id: t.equipement_id || null,
                ordre: existants.length + i,
                created_by: createdBy,
              })),
            )
            .throwOnError()
        }

        // Tâche conservée dont le libellé/lieu/équipement a changé : seuls ces
        // champs bougent, le statut d'avancement reste intact.
        for (const t of taches) {
          if (t.id == null) continue
          const existant = existantsParId.get(t.id)
          if (!existant) continue
          const libelle = t.libelle.trim() || 'Tâche'
          const localId = t.local_id || ''
          const equipementId = t.equipement_id || ''
          if (
            existant.libelle !== libelle ||
            existant.local_id !== localId ||
            existant.equipement_id !== equipementId
          ) {
            await supabase
              .from('travaux_taches')
              .update({
                libelle,
                local_id: localId || null,
                equipement_id: equipementId || null,
              })
              .eq('id', t.id)
              .throwOnError()
          }
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
