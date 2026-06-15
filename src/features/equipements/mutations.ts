import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { equipementsQueries } from './queries'
import { equipementSchema, type EquipementFormValues } from './schemas'
import { serializeChamps } from '@/lib/champs'
import { categoriesQueries } from '@/features/categories/queries'

/**
 * Crée une SOUS-catégorie de parc (scope 'parc') liée à un modèle de site : tous
 * les équipements qu'on y créera seront des copies de ce modèle. Le modèle est
 * OBLIGATOIRE ici (flotte homogène) ; la base valide qu'il appartient au site.
 */
export function useCreateParcSousCategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      nom,
      parentId,
      siteId,
      modeleId,
    }: {
      nom: string
      parentId: string
      siteId: string
      modeleId: string
    }) => {
      const { data } = await supabase
        .from('categories')
        .insert({
          nom: nom.trim(),
          scope: 'parc',
          site_id: siteId,
          parent_id: parentId,
          modele_equipement_id: modeleId,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoriesQueries.all() }),
  })
}

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
      // Verrou : refuser si au moins une gamme VIVANTE est liée à l'équipement.
      // On filtre `gammes.deleted_at` en 2 temps (récupérer les liaisons puis
      // compter les gammes vivantes) : une gamme supprimée — invisible partout —
      // ne doit PAS rendre l'équipement définitivement insupprimable.
      const { data: liaisons } = await supabase
        .from('gammes_equipements')
        .select('gamme_id')
        .eq('equipement_id', id)
        .throwOnError()
      const gammeIds = liaisons.map((l) => l.gamme_id)
      if (gammeIds.length > 0) {
        const { count } = await supabase
          .from('gammes')
          .select('id', { count: 'exact', head: true })
          .in('id', gammeIds)
          .is('deleted_at', null)
          .throwOnError()
        if ((count ?? 0) > 0) {
          throw new Error(
            'Détache d’abord les gammes liées à cet équipement avant de le supprimer.',
          )
        }
      }
      // `.select('id').single()` : un UPDATE qui matche 0 ligne (hors périmètre RLS)
      // devient une erreur (PGRST116) au lieu d'un faux succès « supprimé ».
      await supabase
        .from('equipements')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single()
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
      categorieId,
    }: {
      modeleId: string
      localId: string
      codeInventaire: string
      /** Catégorie de PARC (scope 'parc') où ranger l'équipement ; null = Non classé. */
      categorieId?: string | null
    }) => {
      const { data } = await supabase
        .rpc('instancier_equipement', {
          p_modele_id: modeleId,
          p_local_id: localId,
          p_code_inventaire: codeInventaire,
          ...(categorieId ? { p_categorie_id: categorieId } : {}),
        })
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: equipementsQueries.all() }),
  })
}
