import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { evenementsQueries } from './queries'
import { travauxQueries } from '@/features/travaux/queries'
import { STATUT_CLOTURE } from './schemas'
import type { EvenementFormValues, LieuFormValues } from './schemas'
import type { TacheEntree } from '@/features/taches/components/taches-multiples-field'
import {
  diffTaches,
  tachesACreer,
  type TacheExistante,
} from '@/features/taches/taches-sync'
import type { StatutZone } from '@/features/taches/statut-zone'

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
    local_id: v.local_id || null,
    equipement_id: v.equipement_id || null,
  }
}

export function useCreateEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      siteId,
      values,
    }: {
      siteId: string
      values: EvenementFormValues
    }) => {
      // UNE transaction (RPC enregistrer_evenement, 175-176) : la fiche et ses tâches
      // sont écrites ensemble ou pas du tout. created_by = auth.uid() côté base.
      const { data } = await supabase
        .rpc('enregistrer_evenement', {
          p_site_id: siteId,
          p_fiche: toPayload(values),
          p_taches: { ajouter: tachesACreer(values.taches) },
        })
        .throwOnError()
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
      existants?: TacheExistante[]
    }) => {
      // UNE transaction (RPC enregistrer_evenement, 175-176) : fiche + diff des tâches
      // (calculé ici, cf. diffTaches) appliqués ensemble. Tâches absentes →
      // on n'y touche pas. Hors périmètre (0 ligne) → 42501, même message.
      const diff =
        taches && existants && createdBy ? diffTaches(taches, existants) : null
      const { data } = await supabase
        .rpc('enregistrer_evenement', {
          p_id: id,
          p_fiche: toPayload(values),
          p_taches: diff
            ? {
                supprimer: diff.aSupprimer,
                ajouter: diff.aAjouter,
                modifier: diff.aModifier.map((m) => ({
                  id: m.id,
                  ...m.champs,
                })),
              }
            : undefined,
        })
        .throwOnError()

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

/**
 * CORRIGE une clôture déjà enregistrée : date de clôture et/ou compte-rendu,
 * sans toucher au statut. Ne passe pas par `useChangeStatutEvenement` pour ne
 * pas réécrire `statut_evenement_id`/`cloture_by`/`verrouille` à leur propre
 * valeur — miroir exact `useUpdateClotureTravaux`.
 */
export function useUpdateClotureEvenement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      dateCloture,
      compteRendu,
    }: {
      id: string
      dateCloture: string
      compteRendu: string
    }) => {
      const { data } = await supabase
        .from('evenements')
        .update({
          date_cloture: dateCloture,
          compte_rendu: compteRendu.trim() || null,
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
