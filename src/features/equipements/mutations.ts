import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { equipementsQueries } from './queries'
import { equipementSchema, type EquipementFormValues } from './schemas'
import { serializeChamps } from '@/lib/champs'

function equipementPayload(values: EquipementFormValues) {
  const v = equipementSchema.parse(values)
  return {
    nom: v.nom,
    code_inventaire: v.code_inventaire || null,
    categorie_id: v.categorie_id || null,
    local_id: v.local_id,
    date_mise_en_service: v.date_mise_en_service || null,
    date_fin_garantie: v.date_fin_garantie || null,
    commentaires: v.commentaires || null,
    miniature_id: v.miniature_id,
    specifications: serializeChamps(v.specifications),
  }
}

export function useCreateEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: EquipementFormValues) => {
      // Création directe : pas de champs (ils viennent d'un modèle à l'instanciation).
      const { data } = await supabase
        .from('equipements')
        .insert(equipementPayload(values))
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: equipementsQueries.all() }),
  })
}

export function useUpdateEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: EquipementFormValues
    }) => {
      const { data } = await supabase
        .from('equipements')
        .update(equipementPayload(values))
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: equipementsQueries.all() }),
  })
}

export function useDeleteEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Verrou : refuser si au moins une gamme est liée à l'équipement.
      const { count } = await supabase
        .from('gammes_equipements')
        .select('gamme_id', { count: 'exact', head: true })
        .eq('equipement_id', id)
        .throwOnError()
      if ((count ?? 0) > 0) {
        throw new Error(
          'Détache d’abord les gammes liées à cet équipement avant de le supprimer.',
        )
      }
      await supabase
        .from('equipements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: equipementsQueries.all() }),
  })
}

export function useInstancierEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      modeleId,
      localId,
      codeInventaire,
    }: {
      modeleId: string
      localId: string
      codeInventaire: string
    }) => {
      const { data } = await supabase
        .rpc('instancier_equipement', {
          p_modele_id: modeleId,
          p_local_id: localId,
          p_code_inventaire: codeInventaire,
        })
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: equipementsQueries.all() }),
  })
}
