import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { equipementsQueries } from './queries'
import { parseChamps, serializeChamps, type Champ } from '@/lib/champs'
import { categoriesQueries } from '@/features/categories/queries'

/**
 * ÉDITION EN MASSE d'une sous-catégorie SPÉCIFIQUE : met à jour son gabarit local
 * (specifications) PUIS propage le nouvel ensemble de caractéristiques à TOUS ses
 * équipements — en conservant les valeurs déjà saisies (par clé) ; les nouveaux
 * champs prennent leur défaut, les champs retirés disparaissent.
 */
export function useUpdateGabaritSpecifique() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      categorieId,
      champs,
      equipements,
    }: {
      categorieId: string
      champs: Champ[]
      equipements: { id: string; specifications: unknown }[]
    }) => {
      await supabase
        .from('categories')
        .update({ specifications: serializeChamps(champs) })
        .eq('id', categorieId)
        .select('id')
        .single()
        .throwOnError()
      await Promise.all(
        equipements.map(async (eq) => {
          const actuels = parseChamps(eq.specifications)
          const fusion = champs.map((g) => {
            const existant = actuels.find((c) => c.cle === g.cle)
            return { ...g, valeur: existant?.valeur ?? g.defaut ?? null }
          })
          await supabase
            .from('equipements')
            .update({ specifications: serializeChamps(fusion) })
            .eq('id', eq.id)
            .select('id')
            .single()
            .throwOnError()
        }),
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesQueries.all() })
      void qc.invalidateQueries({ queryKey: equipementsQueries.all() })
    },
  })
}

/**
 * Crée une SOUS-catégorie de parc (scope 'parc'). Le modèle est OPTIONNEL :
 * - avec modèle (de site) → les équipements créés dedans en seront des copies ;
 * - sans modèle (null) → équipements SPÉCIFIQUES saisis à la main (rien ne va dans
 *   la Bibliothèque), comme les opérations spécifiques.
 */
export function useCreateParcSousCategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      nom,
      parentId,
      siteId,
      description,
      miniatureId,
      modeleId,
      specifications,
    }: {
      nom: string
      parentId: string
      siteId: string
      description?: string
      miniatureId?: string | null
      /** Source du gabarit : un modèle de site (copies) … */
      modeleId: string | null
      /** … OU un gabarit local « spécifique » (exclusif avec modeleId). */
      specifications?: { champs: Champ[] } | null
    }) => {
      const { data } = await supabase
        .from('categories')
        .insert({
          nom: nom.trim(),
          scope: 'parc',
          site_id: siteId,
          parent_id: parentId,
          description: description?.trim() ? description.trim() : null,
          miniature_id: miniatureId ?? null,
          modele_equipement_id: modeleId,
          specifications: specifications ?? null,
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

/**
 * Crée un équipement DANS une sous-catégorie de parc : il HÉRITE du gabarit de la
 * sous-catégorie (caractéristiques + image), sans saisir image/code/catégorie. La
 * catégorie est celle de la sous-catégorie ; l'image vient du modèle ou de la
 * sous-catégorie ; `copie_depuis_modele_id` relie au modèle source le cas échéant.
 */
export function useCreateEquipementParc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      nom,
      localId,
      categorieId,
      miniatureId,
      champs,
      modeleId,
      dateMiseEnService,
      dateFinGarantie,
    }: {
      nom: string
      localId: string
      categorieId: string
      miniatureId: string | null
      champs: Champ[]
      modeleId: string | null
      // Données « de base » standard de l'équipement (B).
      dateMiseEnService?: string
      dateFinGarantie?: string
    }) => {
      const { data } = await supabase
        .from('equipements')
        .insert({
          nom: nom.trim(),
          local_id: localId,
          categorie_id: categorieId,
          miniature_id: miniatureId,
          specifications: serializeChamps(champs),
          copie_depuis_modele_id: modeleId,
          date_mise_en_service: dateMiseEnService?.trim()
            ? dateMiseEnService
            : null,
          date_fin_garantie: dateFinGarantie?.trim() ? dateFinGarantie : null,
        })
        .select('id')
        .single()
        .throwOnError()
      return data
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: equipementsQueries.all() }),
  })
}

/**
 * Met à jour un équipement de parc depuis le formulaire ÉPURÉ (mêmes champs que la
 * création) : nom, emplacement, dates, valeurs des caractéristiques. Ne TOUCHE PAS
 * l'image (héritée), la catégorie (sa sous-catégorie) ni le lien au modèle.
 */
export function useUpdateEquipementParc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      nom,
      localId,
      champs,
      dateMiseEnService,
      dateFinGarantie,
    }: {
      id: string
      nom: string
      localId: string
      champs: Champ[]
      dateMiseEnService?: string
      dateFinGarantie?: string
    }) => {
      const { data } = await supabase
        .from('equipements')
        .update({
          nom: nom.trim(),
          local_id: localId,
          specifications: serializeChamps(champs),
          date_mise_en_service: dateMiseEnService?.trim()
            ? dateMiseEnService
            : null,
          date_fin_garantie: dateFinGarantie?.trim() ? dateFinGarantie : null,
        })
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
