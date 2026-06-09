import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { modelesEquipementsQueries } from './queries'
import type { ModeleEquipementFormValues } from './schemas'

// Construit le payload base, dont l'objet JSON `specifications` (clés vides
// ignorées ; en cas de doublon de clé, la dernière l'emporte — l'unicité est
// validée en amont dans le formulaire).
function modelePayload(v: ModeleEquipementFormValues, siteId: string | null) {
  const specifications: Record<string, string> = {}
  for (const { cle, valeur } of v.specifications) {
    const k = cle.trim()
    if (k) specifications[k] = valeur.trim()
  }
  return {
    nom: v.nom.trim(),
    description: v.description.trim() || null,
    categorie_id: v.categorie_id || null,
    est_actif: v.etat === 'actif',
    site_id: v.portee === 'entreprise' ? null : siteId,
    specifications,
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
        .insert(modelePayload(values, siteId))
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

export function useDeleteModeleEquipement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Soft-delete : corbeille 90j côté backend. Les équipements déjà
      // instanciés gardent leur copie (snapshot indépendant).
      await supabase
        .from('modeles_equipements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: modelesEquipementsQueries.all() }),
  })
}
