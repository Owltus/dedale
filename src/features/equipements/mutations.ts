import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { equipementsQueries } from './queries'
import { parseChamps, serializeChamps, type Champ } from '@/lib/champs'
import { categoriesQueries } from '@/features/categories/queries'

/**
 * ÉDITION des attributs de BASE d'une SOUS-catégorie de parc : nom / description /
 * image. Les CARACTÉRISTIQUES (`specifications`) d'un gabarit spécifique ne sont PLUS
 * écrites ici : elles s'enregistrent au fil de l'eau via
 * `useUpdateParcSousCategorieChamps` (UX « ajout immédiat », comme la fiche modèle).
 * Le TYPE de gabarit (modèle ↔ spécifique) est fixé à la création (non modifiable ici).
 */
export function useUpdateParcSousCategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      nom,
      description,
      miniatureId,
    }: {
      id: string
      nom: string
      description?: string
      miniatureId: string | null
    }) => {
      await supabase
        .from('categories')
        .update({
          nom: nom.trim(),
          description: description?.trim() ? description.trim() : null,
          miniature_id: miniatureId,
        })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: categoriesQueries.all() }),
  })
}

/**
 * Met à jour UNIQUEMENT les caractéristiques (`specifications`) d'une sous-catégorie
 * de parc SPÉCIFIQUE et les PROPAGE à ses équipements (fusion par clé : valeurs déjà
 * saisies conservées, nouveaux champs au défaut, champs retirés supprimés). Permet
 * d'enregistrer CHAQUE caractéristique au fil de l'eau, sans réécrire nom/description/
 * image — le modal reste ouvert pour en ajouter d'autres.
 */
export function useUpdateParcSousCategorieChamps() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      champs,
      equipements,
    }: {
      id: string
      champs: Champ[]
      equipements: { id: string; specifications: unknown }[]
    }) => {
      // Pré-calcul des fusions + contrôle de TAILLE de chaque équipement (gabarit +
      // clé `valeur` ajoutée) AVANT toute écriture : le CHECK Postgres rejette
      // specifications::text >= 10000. On échoue ICI, atomiquement, plutôt qu'en
      // plein Promise.all (ce qui laisserait une propagation PARTIELLE).
      const fusions = equipements.map((eq) => {
        const actuels = parseChamps(eq.specifications)
        const fusion = champs.map((g) => {
          const existant = actuels.find((c) => c.cle === g.cle)
          return { ...g, valeur: existant?.valeur ?? g.defaut ?? null }
        })
        return { id: eq.id, payload: serializeChamps(fusion) }
      })
      // Marge FRANCHE sous le CHECK Postgres (specifications::text < 10000) :
      // jsonb::text ajoute des espaces (« : », « , ») absents de JSON.stringify, donc
      // la longueur réelle en base est plus grande → on garde du mou (9000).
      if (fusions.some((f) => JSON.stringify(f.payload).length >= 9000)) {
        throw new Error(
          'Trop de caractéristiques pour un équipement de cette sous-catégorie (limite de taille atteinte).',
        )
      }
      await supabase
        .from('categories')
        .update({ specifications: serializeChamps(champs) })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
      await Promise.all(
        fusions.map((f) =>
          supabase
            .from('equipements')
            .update({ specifications: f.payload })
            .eq('id', f.id)
            .select('id')
            .single()
            .throwOnError(),
        ),
      )
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: categoriesQueries.all() })
      void qc.invalidateQueries({ queryKey: equipementsQueries.all() })
    },
    onError: () => {
      // Une propagation a pu n'aboutir que PARTIELLEMENT (suppression concurrente
      // d'un équipement, RLS…) → resynchroniser le cache sur la vérité de la base.
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
      // Verrou : refuser si au moins une gamme est liée à l'équipement. La FK
      // RESTRICT bloquerait de toute façon la suppression, mais on vérifie en
      // amont pour afficher un message clair plutôt qu'une erreur brute.
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
      // Suppression définitive (hard-delete). `.select('id').single()` : un DELETE
      // qui matche 0 ligne (hors périmètre RLS) devient une erreur (PGRST116) au
      // lieu d'un faux succès « supprimé ».
      await supabase
        .from('equipements')
        .delete()
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
