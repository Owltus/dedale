import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { modelesEquipementsQueries } from './queries'
import type { ModeleEquipementFormValues } from './schemas'
import { serializeChamps, type Champ } from '@/lib/champs'
import { siteIdPourPortee } from '@/lib/scope'

// Payload des champs de BASE d'un modèle (HORS `specifications`). Le JSONB des
// caractéristiques est écrit à part : à l'INSERT (création) et via
// `useUpdateModeleSpecifications` (page de détail), JAMAIS par l'UPDATE du
// formulaire d'édition — pour ne pas écraser des champs édités en parallèle.
function modelePayload(v: ModeleEquipementFormValues, siteId: string | null) {
  return {
    nom: v.nom.trim(),
    description: v.description.trim() || null,
    // Catégorie OBLIGATOIRE (NOT NULL côté base) : la validation Zod
    // (`categorie_id.min(1)`) garantit déjà une valeur non vide.
    categorie_id: v.categorie_id,
    est_actif: v.etat === 'actif',
    site_id: siteIdPourPortee(v.portee, siteId),
    // Vignette du pool (cohérence de site garantie par trigger côté base).
    miniature_id: v.miniature_id,
  }
}

export function useCreateModeleEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      values,
      siteId,
    }: {
      values: ModeleEquipementFormValues
      siteId: string | null
    }) => {
      const { data } = await supabase
        .from('modeles_equipements')
        .insert({
          ...modelePayload(values, siteId),
          specifications: serializeChamps(values.specifications),
        })
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesEquipementsQueries.all() }),
  })
}

export function useUpdateModeleEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
      siteId,
    }: {
      id: string
      values: ModeleEquipementFormValues
      siteId: string | null
    }) => {
      const { data } = await supabase
        .from('modeles_equipements')
        .update(modelePayload(values, siteId))
        .eq('id', id)
        .select()
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesEquipementsQueries.all() }),
  })
}

/**
 * Met à jour UNIQUEMENT le JSONB `specifications` d'un modèle (page de détail :
 * caractéristiques gérées champ par champ). UPDATE PARTIEL : ne touche à aucun
 * autre champ → aucun risque d'écraser nom/description/état édités ailleurs (le
 * formulaire d'édition, lui, n'écrit jamais `specifications`).
 */
export function useUpdateModeleSpecifications() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, champs }: { id: string; champs: Champ[] }) => {
      await supabase
        .from('modeles_equipements')
        .update({ specifications: serializeChamps(champs) })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesEquipementsQueries.all() }),
  })
}

export function useDeleteModeleEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Suppression définitive (hard-delete). Les équipements déjà
      // instanciés gardent leur copie (snapshot indépendant). `.select().single()`
      // → PGRST116 catché si la RLS filtre la ligne, plutôt qu'un faux succès.
      await supabase
        .from('modeles_equipements')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesEquipementsQueries.all() }),
  })
}

/**
 * Copie un modèle d'équipement PAR VALEUR vers un site cible via la RPC dédiée
 * (`copier_modele_equipement`). Cas d'usage : piocher un modèle COMMUN
 * (`site_id NULL`) et l'instancier sur son site, où il devient une copie
 * indépendante (snapshot modifiable sans toucher l'original commun). La RPC
 * arbitre les droits (accès au site cible) → 42501 à catcher côté UI.
 */
export function useCopierModeleEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sourceModeleId,
      siteCible,
    }: {
      sourceModeleId: string
      siteCible: string
    }) => {
      const { data } = await supabase
        .rpc('copier_modele_equipement', {
          p_source_modele_id: sourceModeleId,
          p_site_cible: siteCible,
        })
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesEquipementsQueries.all() }),
  })
}
