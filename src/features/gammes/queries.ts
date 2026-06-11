import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { categoriesQueries } from '@/features/categories/queries'
import { sousCategoriesNiveau2 } from '@/lib/scope'
import type { Database } from '@/lib/database.types'

/**
 * Gamme-template de la Bibliothèque, enrichie de ses jointures d'affichage
 * (périodicité, prestataire, catégorie). `site_id NULL` = template commun inerte.
 */
export type GammeBiblioRow = Database['public']['Tables']['gammes']['Row'] & {
  periodicites: {
    id: number
    libelle: string
    jours_periodicite: number
  } | null
  prestataires: { id: string; libelle: string } | null
  categories: {
    id: string
    nom: string
    parent_id: string | null
    scope: Database['public']['Enums']['categorie_scope']
  } | null
}

/**
 * Sous-catégorie de gamme (niveau 2) sélectionnable pour une gamme réelle de
 * site : son id, son nom et le nom de la catégorie racine parente (pour grouper
 * l'affichage par `<optgroup>`).
 */
export interface SousCategorieGamme {
  id: string
  nom: string
  parentId: string
  parentNom: string
}

/**
 * Modèle d'opération lié à une gamme (ligne de `gamme_modeles` aplatie avec
 * le modèle joint) : origine (commun/site via `site_id`) et nombre d'items.
 */
export interface ModeleOperationLie {
  /** Id du modèle d'opération (= `modele_operation_id` de la liaison). */
  id: string
  nom: string
  description: string | null
  site_id: string | null
  nbItems: number
}

export const gammesQueries = {
  all: () => ['gammes'] as const,

  /** Gammes actives du site actif, enrichies de la périodicité et du prestataire. */
  list: (siteId: string | null) =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'list', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes')
          .select(
            '*, periodicites(id, libelle, jours_periodicite), prestataires(id, libelle)',
          )
          .eq('site_id', siteId!)
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Catalogue COMPLET des gammes (commun + sites accessibles) SANS filtre de
   * site : le périmètre est appliqué côté composant via le sélecteur de la
   * Bibliothèque. La RLS arbitre la visibilité réelle. Enrichi de la périodicité,
   * du prestataire et de la catégorie (arborescence).
   */
  biblioPool: () =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'biblio-pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes')
          .select(
            '*, periodicites(id, libelle, jours_periodicite), prestataires(id, libelle), categories(id, nom, parent_id, scope)',
          )
          .is('deleted_at', null)
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Sous-catégories de gamme (niveau 2) sélectionnables pour une gamme RÉELLE
   * de site. Une sous-catégorie valide est : scope `gamme`/`mixte` (jamais
   * `equipement`), active, non supprimée, de **niveau 2** (`parent_id` non nul
   * ET ce parent est une racine, `parent_id` nul). Périmètre = commun
   * (`site_id` NULL) + le site courant — cohérent avec le trigger backend
   * (gamme de site → catégorie commune OU du même site). Renvoie le nom du
   * parent (catégorie racine) pour grouper l'affichage.
   */
  sousCategories: (siteId: string | null) =>
    queryOptions({
      // Clé sous le namespace `categories` (et non `gammes`) : la query lit la
      // table `categories`, donc les invalidations + le realtime des catégories
      // doivent la rafraîchir.
      queryKey: [
        ...categoriesQueries.all(),
        'sous-categories-gamme',
        siteId,
      ] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('categories')
          .select('id, nom, parent_id, scope, site_id, est_actif, ordre')
          .is('deleted_at', null)
          .eq('est_actif', true)
          .in('scope', ['gamme', 'mixte'])
          .order('ordre')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        // Sélection niveau 2 + périmètre factorisée (partagée avec le panneau
        // Bibliothèque) : on n'a plus qu'à mettre en forme pour l'affichage.
        return sousCategoriesNiveau2(data, siteId).map(
          ({ sous, racine }): SousCategorieGamme => ({
            id: sous.id,
            nom: sous.nom,
            parentId: racine.id,
            parentNom: racine.nom,
          }),
        )
      },
      staleTime: 60_000,
    }),

  /** Opérations d'une gamme, ordonnées, avec type et unité. */
  operations: (gammeId: string) =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'operations', gammeId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('operations')
          .select(
            '*, types_operations(id, libelle, necessite_seuils), unites(id, nom, symbole)',
          )
          .eq('gamme_id', gammeId)
          .order('ordre')
          // `ordre` est un entier libre (DEFAULT 0) → clés secondaires STABLES
          // pour un ordre déterministe à `ordre` égal (pas de saut visuel au
          // refetch/mutation).
          .order('created_at')
          .order('id')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),

  /**
   * Modèles d'opération liés à une gamme (via `gamme_modeles`), avec leur
   * origine (commun/site) et le nombre d'items. La RLS arbitre la visibilité
   * (la liaison n'est lisible que si la gamme parente l'est).
   */
  modelesLies: (gammeId: string) =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'modeles-lies', gammeId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gamme_modeles')
          .select(
            'created_at, modeles_operations!inner(id, nom, description, site_id, modeles_operations_items(id))',
          )
          .eq('gamme_id', gammeId)
          // Tri stable : `created_at` partagé par les imports groupés → clé
          // secondaire déterministe sur l'id du modèle.
          .order('created_at')
          .order('modele_operation_id')
          .abortSignal(signal)
          .throwOnError()
        return data.map(
          (row): ModeleOperationLie => ({
            id: row.modeles_operations.id,
            nom: row.modeles_operations.nom,
            description: row.modeles_operations.description,
            site_id: row.modeles_operations.site_id,
            nbItems: row.modeles_operations.modeles_operations_items.length,
          }),
        )
      },
      staleTime: 60_000,
    }),

  /** Équipements liés à une gamme (ids uniquement, pour cocher la liste). */
  equipementsLies: (gammeId: string) =>
    queryOptions({
      queryKey: [...gammesQueries.all(), 'equipements', gammeId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gammes_equipements')
          .select('equipement_id')
          .eq('gamme_id', gammeId)
          .abortSignal(signal)
          .throwOnError()
        return data.map((r) => r.equipement_id)
      },
      staleTime: 60_000,
    }),
}

export const referentielsQueries = {
  /** Périodicités (référentiel global, peu mouvant). */
  periodicites: () =>
    queryOptions({
      queryKey: ['periodicites', 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('periodicites')
          .select('id, libelle, jours_periodicite')
          .order('jours_periodicite')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),

  /** Types d'opération (référentiel global). */
  typesOperations: () =>
    queryOptions({
      queryKey: ['types_operations', 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('types_operations')
          .select('id, libelle, necessite_seuils')
          .order('libelle')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),

  /** Unités de mesure (référentiel global). */
  unites: () =>
    queryOptions({
      queryKey: ['unites', 'list'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('unites')
          .select('id, nom, symbole')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}
