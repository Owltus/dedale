import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { documentsQueries, liaisonTable } from './queries'
import { CLE_PAR_TACHE } from './queries'
import type { DocumentDeTache, LiaisonTable } from './queries'
import type { DocumentMeta } from './format'
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
      /** 091 : rattache directement à une tâche précise (sinon niveau fiche). */
      tacheId?: string | null
    }) => {
      const { liaison, parentColumn, parentId, tacheId, ...uploadParams } =
        params
      // (a) + (b)
      const doc = await uploadDocument(uploadParams)
      // (c) rattachement à l'entité
      const { error: liaisonError } = await liaisonTable(liaison).insert({
        document_id: doc.id,
        [parentColumn]: parentId,
        ...(tacheId !== undefined ? { tache_id: tacheId } : {}),
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
      /** 091 : rattache directement à une tâche précise (sinon niveau fiche). */
      tacheId?: string | null
    }) => {
      const { liaison, parentColumn, parentId, documentIds, tacheId } = params
      await liaisonTable(liaison)
        .insert(
          documentIds.map((documentId) => ({
            document_id: documentId,
            [parentColumn]: parentId,
            ...(tacheId !== undefined ? { tache_id: tacheId } : {}),
          })) as { document_id: string; ordre_travail_id: string }[],
        )
        .throwOnError()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
  })
}

/**
 * Rattache un document à une TÂCHE précise de la fiche (091, étape 6), ou le
 * détache au niveau fiche (`tacheId: null`) — ne touche que `tache_id`, pas
 * la liaison document↔fiche elle-même (`document_id`/`parentColumn`
 * inchangés). Mise à jour optimiste : le document change de liste de cache
 * IMMÉDIATEMENT (retiré de partout où il était affiché pour cette fiche,
 * ajouté à la liste de destination si déjà en cache), sans attendre la
 * confirmation serveur — glisser-déposer fluide.
 */
export function useDeplacerDocumentTache() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      liaison: LiaisonTable
      parentColumn: string
      parentId: string
      documentId: string
      tacheId: string | null
    }) => {
      const { liaison, parentColumn, parentId, documentId, tacheId } = params
      const base = liaisonTable(liaison)
      // `tache_id` (091) n'existe que sur 2 des 10 tables de liaison — le
      // typage générique de `liaisonTable` ne le connaît pas, on relâche
      // localement (même principe que `documentsQueries.byEntity`). Le
      // filtre retourné par `.update()` chaîne les mêmes méthodes que celui
      // de `.delete()` (déjà utilisé juste plus bas) — on réutilise son type.
      await (
        base as unknown as {
          update: (values: {
            tache_id: string | null
          }) => ReturnType<typeof base.delete>
        }
      )
        .update({ tache_id: tacheId })
        .eq('document_id', documentId)
        .eq(parentColumn, parentId)
        .throwOnError()
    },
    onMutate: async (params) => {
      const { liaison, parentId, documentId, tacheId } = params
      await qc.cancelQueries({ queryKey: documentsQueries.all() })
      // Toutes les listes déjà en cache pour CETTE fiche, quel que soit leur
      // filtre : niveau fiche (`byEntity`, DocumentMeta[]) ET documents de
      // toutes les tâches (`parTache`, DocumentDeTache[], une seule entrée).
      const caches = qc.getQueriesData<DocumentMeta[] | DocumentDeTache[]>({
        queryKey: [...documentsQueries.all(), 'by-entity', liaison, parentId],
      })
      const estParTache = (key: readonly unknown[]) => key[4] === CLE_PAR_TACHE
      let movedDoc: DocumentMeta | undefined
      caches.forEach(([key, data]) => {
        if (!data) return
        const found = estParTache(key)
          ? (data as DocumentDeTache[]).find((r) => r.doc.id === documentId)
              ?.doc
          : (data as DocumentMeta[]).find((d) => d.id === documentId)
        if (found) movedDoc = found
      })
      caches.forEach(([key, data]) => {
        if (!data) return
        if (estParTache(key)) {
          // Documents de toutes les tâches : on déplace la ligne (ou on la
          // retire si le document remonte au niveau fiche, ou l'ajoute s'il
          // en descend).
          const rows = (data as DocumentDeTache[]).filter(
            (r) => r.doc.id !== documentId,
          )
          qc.setQueryData(
            key,
            tacheId !== null && movedDoc
              ? [{ tacheId, doc: movedDoc }, ...rows]
              : rows,
          )
          return
        }
        const liste = data as DocumentMeta[]
        const entryFilter = key[4] as string | null | undefined
        const isDestination = (entryFilter ?? null) === tacheId
        if (isDestination) {
          if (movedDoc && !liste.some((d) => d.id === documentId)) {
            qc.setQueryData(key, [movedDoc, ...liste])
          }
        } else if (liste.some((d) => d.id === documentId)) {
          qc.setQueryData(
            key,
            liste.filter((d) => d.id !== documentId),
          )
        }
      })
      return { caches }
    },
    onError: (_err, _params, context) => {
      context?.caches.forEach(([key, data]) => {
        qc.setQueryData(key, data)
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: documentsQueries.all() }),
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
