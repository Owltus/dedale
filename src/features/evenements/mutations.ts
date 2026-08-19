import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { evenementsQueries } from './queries'
import { travauxQueries } from '../travaux/queries'
import { STATUT_CLOTURE } from './schemas'
import type { EvenementFormValues, LieuFormValues } from './schemas'

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

      // Lieux ajoutés directement à la création (facultatif) : une ligne
      // sans local_id est ignorée (l'usager a pu ajouter puis abandonner).
      const lieux = values.lieux.filter((l) => l.local_id)
      if (lieux.length) {
        await supabase
          .from('evenements_lieux')
          .insert(
            lieux.map((l, i) => ({
              evenement_id: data.id,
              local_id: l.local_id,
              equipement_id: l.equipement_id || null,
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

export function useUpdateEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: EvenementFormValues
    }) => {
      const { data } = await supabase
        .from('evenements')
        .update(toPayload(values))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()

      // Remplace la liste de lieux par celle du formulaire (retraits + ajouts
      // en une fois) — volume faible, sans FK entrante sur evenements_lieux.id
      // depuis une autre table : un DELETE ALL + INSERT ALL est plus simple
      // et tout aussi sûr qu'un diff ligne à ligne.
      await supabase
        .from('evenements_lieux')
        .delete()
        .eq('evenement_id', id)
        .throwOnError()
      const lieux = values.lieux.filter((l) => l.local_id)
      if (lieux.length) {
        await supabase
          .from('evenements_lieux')
          .insert(
            lieux.map((l, i) => ({
              evenement_id: id,
              local_id: l.local_id,
              equipement_id: l.equipement_id || null,
              ordre: i,
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

// ─── Lieux concernés (086, miroir des mutations de tâches Travaux) ───────────

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
      qc.invalidateQueries({
        queryKey: evenementsQueries.lieux(vars.evenementId).queryKey,
      }),
  })
}

/** Modifie le local et/ou l'équipement d'un lieu existant. */
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
