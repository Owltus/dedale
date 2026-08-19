import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { referentielQueryOptions } from '@/lib/referentiel'
import { getSignedUrl } from './upload'
import type { DocumentMeta } from './format'

/**
 * Tables de liaison documents ↔ entité. Le `DocumentsTab` étant volontairement
 * polymorphe (table choisie à l'exécution), on borne le nom à cette union et on
 * passe par `liaisonTable()` qui assouplit le typage du builder pour ces tables
 * qui partagent toutes la même forme (document_id + FK parente + created_at).
 */
export type LiaisonTable =
  | 'documents_contrats'
  | 'documents_di'
  | 'documents_equipements'
  | 'documents_evenements'
  | 'documents_gammes'
  | 'documents_interventions_travaux'
  | 'documents_investissements'
  | 'documents_locaux'
  | 'documents_ordres_travail'
  | 'documents_prestataires'

/** Builder de requête pour une table de liaison (typage assoupli, FK dynamique). */
export function liaisonTable(liaison: LiaisonTable) {
  // Toutes les tables `documents_*` partagent la même forme ; on type le builder
  // sur l'une d'elles pour conserver l'auto-complétion sur document_id/created_at.
  return supabase.from(liaison as 'documents_ordres_travail')
}

export const documentsQueries = {
  all: () => ['documents'] as const,

  /** Bibliothèque : tous les documents du site actif. */
  list: (siteId: string) =>
    queryOptions({
      queryKey: [...documentsQueries.all(), 'list', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('documents')
          .select(
            'id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at',
          )
          .eq('site_id', siteId)
          .order('uploaded_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Documents liables à une entité : ceux du site actif + ceux de la
   * bibliothèque entreprise (site_id NULL, partagés entre tous les sites).
   */
  listLiables: (siteId: string) =>
    queryOptions({
      queryKey: [...documentsQueries.all(), 'list-liables', siteId] as const,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('documents')
          .select(
            'id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at, site_id',
          )
          .or(`site_id.is.null,site_id.eq.${siteId}`)
          .order('uploaded_at', { ascending: false })
          .abortSignal(signal)
          .throwOnError()
        return data
      },
    }),

  /**
   * Documents rattachés à une entité via sa table de liaison.
   * `liaison` = nom de la table de liaison (ex. 'documents_ordres_travail').
   * `parentColumn` = colonne FK vers l'entité (ex. 'ordre_travail_id').
   *
   * `tacheFilter` (091, seulement pertinent pour `documents_interventions_travaux`/
   * `documents_evenements`, qui ont une colonne `tache_id`) : omis → aucun
   * filtre (comportement historique, pour les 9 autres liaisons qui n'ont pas
   * cette colonne) ; `null` → documents niveau FICHE seulement
   * (`tache_id IS NULL`) ; un id → documents de CETTE tâche précise.
   */
  byEntity: (
    liaison: LiaisonTable,
    parentColumn: string,
    parentId: string,
    tacheFilter?: string | null,
  ) =>
    queryOptions({
      queryKey: [
        ...documentsQueries.all(),
        'by-entity',
        liaison,
        parentId,
        tacheFilter,
      ] as const,
      queryFn: async ({ signal }) => {
        const base = liaisonTable(liaison)
          // On joint le document parent rattaché à l'entité.
          .select(
            'document_id, documents:document_id (id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at)',
          )
          .eq(parentColumn, parentId)
        // `tache_id` (091) n'existe que sur 2 des 10 tables de liaison — le
        // typage générique de `liaisonTable` ne le connaît pas, on relâche
        // localement (même principe que `liaisonTable` elle-même).
        const query =
          tacheFilter === undefined
            ? base
            : tacheFilter === null
              ? (
                  base as unknown as {
                    is: (column: string, value: null) => typeof base
                  }
                ).is('tache_id', null)
              : (
                  base as unknown as {
                    eq: (column: string, value: string) => typeof base
                  }
                ).eq('tache_id', tacheFilter)
        const { data } = await query.abortSignal(signal).throwOnError()
        const rows = data as {
          documents: DocumentMeta | null
        }[]
        return rows
          .map((row) => row.documents)
          .filter((doc): doc is DocumentMeta => doc != null)
      },
    }),

  /**
   * URL signée temporaire d'un document (aperçu/téléchargement). Expire au bout
   * de 10 min ; `staleTime` < expiration → réémission automatique à la réouverture.
   */
  signedUrl: (storagePath: string) =>
    queryOptions({
      queryKey: [...documentsQueries.all(), 'signed-url', storagePath] as const,
      queryFn: () => getSignedUrl(storagePath, 600),
      staleTime: 9 * 60_000,
    }),
}

export const typesDocumentsQueries = {
  all: () => ['types_documents'] as const,

  /** Référentiel des types de document (systèmes + créés par l'entreprise). */
  list: () => referentielQueryOptions('types_documents', 'id, nom', 'nom'),
}
