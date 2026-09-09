import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/lib/database.types'

export type ModeleOperation =
  Database['public']['Tables']['modeles_operations']['Row']

/**
 * Modèle d'opération candidat à l'import dans une gamme, enrichi du nombre
 * d'items. Permet d'exclure les modèles VIDES côté UI : les lier déclencherait
 * un trigger `check_violation` (23514) qui ferait échouer l'INSERT groupé
 * atomique (aucun modèle lié).
 */
export interface ModeleOperationImportable {
  id: string
  nom: string
  description: string | null
  site_id: string | null
  nbItems: number
}

/**
 * Gamme liée à un modèle d'opération (ligne `gamme_modeles` aplatie) : sert à
 * lister les gammes concernées avant la suppression d'un modèle.
 */
export interface GammeLieeAModele {
  gammeId: string
  nom: string
}

export const modelesOperationsQueries = {
  all: () => ['modeles_operations'] as const,

  /**
   * Gammes liées à un modèle d'opération via `gamme_modeles`. Sert UNIQUEMENT à
   * formuler le message de confirmation avant suppression (combien de gammes,
   * lesquelles). La suppression elle-même passe toujours par la RPC atomique
   * `detacher_et_supprimer_modele_operation`, qui détache TOUTES les liaisons —
   * y compris les gammes hors périmètre masquées par la RLS et absentes de cette
   * liste — avant de supprimer : aucun blocage FK résiduel à gérer côté UI.
   */
  liens: (modeleId: string) =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'liens', modeleId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('gamme_modeles')
          .select('gamme_id, gammes(nom)')
          .eq('modele_operation_id', modeleId)
          .abortSignal(signal)
          .throwOnError()
        return data.map(
          (row): GammeLieeAModele => ({
            gammeId: row.gamme_id,
            // `gamme_id` est une FK NOT NULL → la gamme jointe existe toujours.
            nom: row.gammes.nom,
          }),
        )
      },
      staleTime: 30_000,
    }),

  /** Items (opérations types) d'un modèle, ordonnés, avec type et unité. */
  items: (modeleId: string) =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'items', modeleId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations_items')
          .select(
            '*, types_operations(id, libelle, necessite_seuils), unites(id, nom, symbole)',
          )
          .eq('modele_operation_id', modeleId)
          .order('ordre')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Libellés des items de PLUSIEURS modèles d'un coup (`modele_operation_id`
   * conservé). Sert à l'import CSV : dire à l'IA ce qui existe déjà et repérer
   * les opérations en double sans une requête par modèle.
   */
  itemsDesModeles: (modeleIds: string[]) =>
    queryOptions({
      queryKey: [
        ...modelesOperationsQueries.all(),
        'items-multi',
        [...modeleIds].sort().join(','),
      ] as const,
      enabled: modeleIds.length > 0,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations_items')
          .select('modele_operation_id, nom')
          .in('modele_operation_id', modeleIds)
          .order('ordre')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Tout l'accessible (RLS) SANS filtre de site : le périmètre (Tout / Commun /
   * site) est appliqué côté composant.
   */
  pool: () =>
    queryOptions({
      queryKey: [...modelesOperationsQueries.all(), 'pool'] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('modeles_operations')
          .select('*')
          .order('nom')
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Modèles d'opération LIABLES à une gamme : ceux du MÊME périmètre qu'elle —
   * une gamme de site ne rattache que des modèles de ce site, un template
   * commun que des modèles communs. Le catalogue du siège s'installe d'abord
   * sur le site depuis la Bibliothèque (« Importer depuis le commun »), ce qui
   * en dépose une copie ; c'est cette copie qui devient liable. Enrichi du
   * nombre d'items : l'appelant écarte les modèles VIDES, non liables (trigger
   * `check_violation`).
   */
  liables: (gammeSiteId: string | null) =>
    queryOptions({
      queryKey: [
        ...modelesOperationsQueries.all(),
        'liables',
        gammeSiteId,
      ] as const,
      queryFn: async ({ signal }) => {
        const requete = supabase
          .from('modeles_operations')
          .select('id, nom, description, site_id, modeles_operations_items(id)')
          .order('nom')
        const { data } = await (
          gammeSiteId === null
            ? requete.is('site_id', null)
            : requete.eq('site_id', gammeSiteId)
        )
          .abortSignal(signal)
          .throwOnError()
        return data.map(
          (m): ModeleOperationImportable => ({
            id: m.id,
            nom: m.nom,
            description: m.description,
            site_id: m.site_id,
            nbItems: m.modeles_operations_items.length,
          }),
        )
      },
    }),
}
