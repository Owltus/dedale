import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { documentsQueries, liaisonTable } from './queries'
import type { LiaisonTable } from './queries'
import { replaceDocumentFile, uploadDocument } from './upload'

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
 *
 * Si (b) retombe sur un document déjà EXISTANT (doublon de contenu détecté par
 * `uploadDocument`, cf. `dejaExistant`), (c) tente quand même le rattachement —
 * ce document n'est peut-être pas encore lié à CETTE fiche précise. Si (c)
 * échoue à son tour parce qu'il l'est déjà (PK document_id+parent en doublon),
 * ce n'est pas un échec non plus : le résultat voulu (document lié à la fiche)
 * est déjà atteint, `dejaLie` le signale à l'appelant pour adapter son message.
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
      const { error: liaisonError } = await liaisonTable(liaison).insert({
        document_id: doc.id,
        [parentColumn]: parentId,
      } as {
        document_id: string
        ordre_travail_id: string
      })
      if (liaisonError) {
        if (liaisonError.code === '23505') {
          return { ...doc, dejaLie: true }
        }
        throw liaisonError
      }
      return doc
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}

/** Lie un ou plusieurs documents déjà en base à une entité, sans upload (étape (c) seule). */
export function useAttachExistingDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      liaison: LiaisonTable
      parentColumn: string
      parentId: string
      documentIds: string[]
    }) => {
      const { liaison, parentColumn, parentId, documentIds } = params
      await liaisonTable(liaison)
        .insert(
          documentIds.map((documentId) => ({
            document_id: documentId,
            [parentColumn]: parentId,
          })) as { document_id: string; ordre_travail_id: string }[],
        )
        .throwOnError()
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

/** Modifie les métadonnées d'un document : nom affiché + type. */
export function useUpdateDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      values: { nom_original: string; type_document_id: number }
    }) => {
      await supabase
        .from('documents')
        .update(params.values)
        .eq('id', params.id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}

/**
 * Remplace le CONTENU d'un document existant (même `id`, donc TOUTES ses
 * liaisons existantes restent en place — pas besoin de re-rattacher le
 * document sur chaque fiche où il apparaît). Le nom affiché et le type ne
 * sont pas touchés — ce sont les champs de `useUpdateDocument`.
 */
export function useReplaceDocumentFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (params: {
      documentId: string
      file: File
      uploadedBy: string
    }) => replaceDocumentFile(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}

/** Suppression définitive (hard-delete) d'un document. */
export function useDeleteDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .select('id')
        .single()
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}
