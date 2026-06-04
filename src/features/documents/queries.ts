import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
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
  | 'documents_gammes'
  | 'documents_interventions_chantier'
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

  /** Bibliothèque : tous les documents du site actif (non supprimés). */
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
          .is('deleted_at', null)
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
   */
  byEntity: (liaison: LiaisonTable, parentColumn: string, parentId: string) =>
    queryOptions({
      queryKey: [
        ...documentsQueries.all(),
        'by-entity',
        liaison,
        parentId,
      ] as const,
      queryFn: async ({ signal }) => {
        const { data } = await liaisonTable(liaison)
          // On joint le document parent ; on filtre les soft-deletes côté JS
          // (le filtre .is() sur une table jointe n'est pas exprimable ici).
          .select(
            'document_id, documents:document_id (id, nom_original, mime_type, taille_octets, type_document_id, storage_path, uploaded_at, deleted_at)',
          )
          .eq(parentColumn, parentId)
          .abortSignal(signal)
          .throwOnError()
        const rows = data as {
          documents: (DocumentMeta & { deleted_at: string | null }) | null
        }[]
        return rows
          .map((row) => row.documents)
          .filter(
            (doc): doc is DocumentMeta & { deleted_at: string | null } =>
              doc != null && doc.deleted_at == null,
          )
      },
    }),
}

export const typesDocumentsQueries = {
  all: () => ['types_documents'] as const,

  /** Référentiel des types de document (systèmes + créés par l'entreprise). */
  list: () =>
    queryOptions({
      queryKey: [...typesDocumentsQueries.all(), 'list'] as const,
      queryFn: async () => {
        const { data } = await supabase
          .from('types_documents')
          .select('id, nom')
          .order('nom')
          .throwOnError()
        return data
      },
      staleTime: 5 * 60_000,
    }),
}
