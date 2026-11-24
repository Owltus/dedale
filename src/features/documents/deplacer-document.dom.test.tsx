import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { documentsQueries, type DocumentDeTache } from './queries'
import { useDeplacerDocumentTache } from './mutations'
import type { DocumentMeta } from './format'

/**
 * Déplacement d'un document entre tâches (glisser-déposer) : la mise à jour
 * OPTIMISTE doit suivre la lecture unique par fiche (`parTache`, étape 1.8)
 * ET la liste du niveau fiche (`byEntity(…, null)`), avant la réponse serveur.
 */
vi.mock('@/lib/supabase', () => {
  const chaine: Record<string, unknown> = new Proxy(
    {},
    {
      get(_c, m) {
        if (m === 'then') return undefined
        if (m === 'throwOnError') return () => new Promise(() => undefined) // reste en attente
        return () => chaine
      },
    },
  )
  return { supabase: { from: () => chaine } }
})

const doc = (id: string): DocumentMeta => ({
  id,
  nom_original: id,
  mime_type: 'application/pdf',
  taille_octets: 1,
  type_document_id: 1,
  storage_path: `s/${id}`,
  uploaded_at: '2026-11-24',
})
const LIAISON = 'documents_interventions_travaux'

function monter() {
  const qc = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const cleTaches = documentsQueries.parTache(
    LIAISON,
    'travaux_id',
    'T',
  ).queryKey
  const cleFiche = documentsQueries.byEntity(
    LIAISON,
    'travaux_id',
    'T',
    null,
  ).queryKey
  qc.setQueryData<DocumentDeTache[]>(cleTaches, [
    { tacheId: 'A', doc: doc('D1') },
    { tacheId: 'B', doc: doc('D2') },
  ])
  qc.setQueryData<DocumentMeta[]>(cleFiche, [doc('D3')])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useDeplacerDocumentTache(), { wrapper })
  return { qc, cleTaches, cleFiche, result }
}

const attendre = () => new Promise((r) => setTimeout(r, 0))

describe('useDeplacerDocumentTache — mise à jour optimiste', () => {
  it('d’une tâche à une autre : la ligne change de tâche', async () => {
    const { qc, cleTaches, result } = monter()
    act(() => {
      result.current.mutate({
        liaison: LIAISON,
        parentColumn: 'travaux_id',
        parentId: 'T',
        documentId: 'D1',
        tacheId: 'B',
      })
    })
    await act(attendre)
    expect(qc.getQueryData<DocumentDeTache[]>(cleTaches)).toEqual([
      { tacheId: 'B', doc: doc('D1') },
      { tacheId: 'B', doc: doc('D2') },
    ])
  })

  it('d’une tâche vers le niveau fiche : quitte les tâches, rejoint la fiche', async () => {
    const { qc, cleTaches, cleFiche, result } = monter()
    act(() => {
      result.current.mutate({
        liaison: LIAISON,
        parentColumn: 'travaux_id',
        parentId: 'T',
        documentId: 'D2',
        tacheId: null,
      })
    })
    await act(attendre)
    expect(qc.getQueryData<DocumentDeTache[]>(cleTaches)).toEqual([
      { tacheId: 'A', doc: doc('D1') },
    ])
    expect(qc.getQueryData<DocumentMeta[]>(cleFiche)).toEqual([
      doc('D2'),
      doc('D3'),
    ])
  })

  it('du niveau fiche vers une tâche : quitte la fiche, rejoint la tâche', async () => {
    const { qc, cleTaches, cleFiche, result } = monter()
    act(() => {
      result.current.mutate({
        liaison: LIAISON,
        parentColumn: 'travaux_id',
        parentId: 'T',
        documentId: 'D3',
        tacheId: 'A',
      })
    })
    await act(attendre)
    expect(qc.getQueryData<DocumentMeta[]>(cleFiche)).toEqual([])
    expect(qc.getQueryData<DocumentDeTache[]>(cleTaches)).toEqual([
      { tacheId: 'A', doc: doc('D3') },
      { tacheId: 'A', doc: doc('D1') },
      { tacheId: 'B', doc: doc('D2') },
    ])
  })
})
