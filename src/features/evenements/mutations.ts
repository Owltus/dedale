import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { evenementsQueries } from './queries'
import { travauxQueries } from '../travaux/queries'
import { STATUT_CLOTURE } from './schemas'
import type { EvenementFormValues, LieuFormValues } from './schemas'
import type { TacheEntree } from '@/features/equipements/components/taches-multiples-field'
import type { StatutZone } from '@/features/equipements/statut-zone'

/**
 * Formulaire → payload base. Les chaînes vides deviennent `null` : `''` est la
 * convention des inputs, `null` celle de la base (cf. `optionalIntId`).
 * 086 : `lieux` n'en fait pas partie — synchronisé à part sur
 * `evenements_lieux` (cf. `useCreateEvenement`/`useUpdateEvenement`).
 */
function toPayload(v: EvenementFormValues) {
  return {
    titre: v.titre.trim(),
    description: v.description.trim() || null,
    date_evenement: v.date_evenement,
    taches_activees: v.taches_activees,
  }
}

export function useCreateEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      createdBy,
      values,
    }: {
      siteId: string
      createdBy: string
      values: EvenementFormValues
    }) => {
      const { data } = await supabase
        .from('evenements')
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
          .from('evenements_lieux')
          .insert(
            taches.map((t, i) => ({
              evenement_id: data.id,
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
      void qc.invalidateQueries({ queryKey: evenementsQueries.all() })
      void qc.invalidateQueries({
        queryKey: evenementsQueries.lieux(data.id).queryKey,
      })
    },
  })
}

/**
 * `taches`/`existants` sont FACULTATIFS (les autres appelants ne touchent pas
 * aux tâches). Quand fournis, les tâches sont resynchronisées par DIFF sur
 * `id` (D11, 090) — jamais par delete-all/insert-all (088) : une tâche
 * conservée sans changement garde son statut d'avancement intact (mêmes
 * raisons que côté Travaux, cf. `useUpdateTravaux`). Comparer par `local_id`
 * (avant 090) ne suffit plus dès qu'une tâche peut n'avoir AUCUN lieu.
 */
export function useUpdateEvenement() {
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
      values: EvenementFormValues
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
        .from('evenements')
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
            .from('evenements_lieux')
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
            .from('evenements_lieux')
            .insert(
              aAjouter.map((t, i) => ({
                evenement_id: id,
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
              .from('evenements_lieux')
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
      void qc.invalidateQueries({ queryKey: evenementsQueries.all() })
      void qc.invalidateQueries({
        queryKey: evenementsQueries.lieux(data.id).queryKey,
      })
    },
  })
}

export function useDeleteEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // `.select().single()` : un DELETE hors périmètre RLS ne touche aucune
      // ligne et lève PGRST116 au lieu de renvoyer un faux succès.
      const { data } = await supabase
        .from('evenements')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: evenementsQueries.all() }),
  })
}

/**
 * Convertit cet Événement en Travaux (copie + suppression de l'Événement, RPC
 * `convertir_evenement_en_travaux`) : documents et TOUTES les zones
 * transférés, statut préservé (087). Retourne l'id du nouveau Travaux (pour
 * rediriger dessus).
 */
export function useConvertirEnTravaux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supabase
        .rpc('convertir_evenement_en_travaux', { p_evenement_id: id })
        .throwOnError()
      return data
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: evenementsQueries.all() })
      void qc.invalidateQueries({ queryKey: travauxQueries.all() })
    },
  })
}

/**
 * Change le statut d'un événement.
 *
 * Passer à « Clôturé » pose la date de clôture et le compte-rendu ; en repartir
 * les efface — sans quoi un événement rouvert garderait une date de clôture dans
 * le futur de son propre suivi, et la contrainte `evenements_dates_coherentes`
 * finirait par le refuser.
 *
 * La date de clôture est une date NUE construite côté appelant (`isoLocale`),
 * jamais un `toISOString()` : c'est ce qui avait produit le 23514 des ordres de
 * travail (migration 075).
 */
export function useChangeStatutEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statutId,
      compteRendu,
      dateCloture,
      clotureBy,
    }: {
      id: string
      statutId: number
      compteRendu?: string
      dateCloture?: string
      clotureBy?: string
    }) => {
      const cloture = statutId === STATUT_CLOTURE
      const { data } = await supabase
        .from('evenements')
        .update({
          statut_evenement_id: statutId,
          compte_rendu: cloture ? (compteRendu?.trim() ?? '') || null : null,
          date_cloture: cloture ? (dateCloture ?? null) : null,
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: evenementsQueries.all() }),
  })
}

/** Verrou anti-erreur (094) : miroir exact `useToggleVerrouTravaux`. */
export function useToggleVerrouEvenement() {
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
        .from('evenements')
        .update({ verrouille })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: evenementsQueries.all() }),
  })
}

// ─── Tâches (086, généralisées 090 — miroir des mutations Travaux) ───────────

export function useCreateLieu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      evenementId,
      createdBy,
      values,
    }: {
      evenementId: string
      createdBy: string
      values: LieuFormValues
    }) => {
      const { data } = await supabase
        .from('evenements_lieux')
        .insert({
          evenement_id: evenementId,
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
        queryKey: evenementsQueries.lieux(vars.evenementId).queryKey,
      }),
  })
}

/** Modifie le libellé, le lieu et/ou le commentaire d'une tâche existante (pas son statut). */
export function useUpdateLieu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      evenementId: string
      values: LieuFormValues
    }) => {
      await supabase
        .from('evenements_lieux')
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
        queryKey: evenementsQueries.lieux(vars.evenementId).queryKey,
      }),
  })
}

export function useUpdateLieuStatut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      statut,
    }: {
      id: string
      evenementId: string
      statut: StatutZone
    }) => {
      await supabase
        .from('evenements_lieux')
        .update({ statut })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: evenementsQueries.lieux(vars.evenementId).queryKey,
      }),
  })
}

/** Modifie la date d'une tâche, éditable EN LIGNE comme le statut (093). */
export function useUpdateLieuDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dateTache,
    }: {
      id: string
      evenementId: string
      dateTache: string
    }) => {
      await supabase
        .from('evenements_lieux')
        .update({ date_tache: dateTache || null })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: evenementsQueries.lieux(vars.evenementId).queryKey,
      }),
  })
}

export function useDeleteLieu() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; evenementId: string }) => {
      await supabase
        .from('evenements_lieux')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: evenementsQueries.lieux(vars.evenementId).queryKey,
      }),
  })
}

/** Réordonnancement par glisser-déposer (étape 5) : réécrit `ordre` selon le nouvel ordre visuel. */
export function useReordonnerLieux() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids }: { evenementId: string; ids: string[] }) => {
      await Promise.all(
        ids.map((id, ordre) =>
          supabase
            .from('evenements_lieux')
            .update({ ordre })
            .eq('id', id)
            .throwOnError(),
        ),
      )
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: evenementsQueries.lieux(vars.evenementId).queryKey,
      }),
  })
}
