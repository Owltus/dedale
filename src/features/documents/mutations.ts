import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { documentsQueries, liaisonTable } from './queries'
import type { LiaisonTable } from './queries'
import { uploadDocument } from './upload'

/**
 * Upload bibliothèque : étapes (a) + (b) seulement (pas de rattachement).
 * Le document reste dans la bibliothèque du site jusqu'à un éventuel rattachement.
 */
export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      file: File
      siteId: string
      uploadedBy: string
      typeDocumentId: number
    }) => uploadDocument(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}

/**
 * Upload + rattachement : étapes (a) + (b) + (c).
 * (c) insert dans la table de liaison de l'entité parente.
 */
export function useUploadAndAttach() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      file: File
      siteId: string
      uploadedBy: string
      typeDocumentId: number
      liaison: LiaisonTable
      parentColumn: string
      parentId: string
    }) => {
      const { liaison, parentColumn, parentId, ...uploadParams } = params
      // (a) + (b)
      const doc = await uploadDocument(uploadParams)
      // (c) rattachement à l'entité
      await liaisonTable(liaison)
        .insert({ document_id: doc.id, [parentColumn]: parentId } as {
          document_id: string
          ordre_travail_id: string
        })
        .throwOnError()
      return doc
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}

/** Détache un document d'une entité (supprime la ligne de liaison, pas le document). */
export function useDetachDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      liaison: LiaisonTable
      parentColumn: string
      parentId: string
      documentId: string
    }) => {
      await liaisonTable(params.liaison)
        .delete()
        .eq('document_id', params.documentId)
        .eq(params.parentColumn, params.parentId)
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}

/** Soft-delete d'un document (corbeille 90j côté backend). */
export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}
