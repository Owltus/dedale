import { useCallback } from 'react'
import { toast } from 'sonner'
import { getSignedUrl } from './upload'
import type { DocumentMeta } from './format'
import { writeErrorMessage } from '@/lib/erreurs'

/**
 * Ouvre un document dans un nouvel onglet (URL signée temporaire). Factorise la
 * logique partagée par la bibliothèque et les fiches (`DocumentsTab`). Erreur →
 * toast. À appeler en `void` (l'action n'attend pas le résultat).
 */
export function useDocumentDownload() {
  return useCallback(async (doc: Pick<DocumentMeta, 'storage_path'>) => {
    try {
      const url = await getSignedUrl(doc.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }, [])
}
