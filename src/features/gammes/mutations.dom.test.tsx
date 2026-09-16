import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from '@tanstack/react-query'
import { modelesOperationsQueries } from '@/features/modeles-operations/queries'
import { gammesQueries } from './queries'
import { useDelierModeleOperation, useLierModelesOperation } from './mutations'

// Client Supabase inerte : toute méthode se chaîne, `throwOnError()` résout.
// Les mutations testées ici n'ont RIEN à dire du réseau — seules comptent les
// clés qu'elles invalident une fois l'écriture passée.
vi.mock('@/lib/supabase', () => {
  const socle: Record<string | symbol, unknown> = {}
  const chaine: unknown = new Proxy(socle, {
    get(_cible, propriete) {
      if (propriete === 'throwOnError') {
        return () => Promise.resolve({ data: [], error: null })
      }
      // `then` doit rester absent : sinon le proxy passe pour une promesse.
      if (propriete === 'then') return undefined
      return () => chaine
    },
  })
  return { supabase: chaine }
})

const GAMME = '33333333-3333-3333-3333-333333333333'
const MODELE = '44444444-4444-4444-4444-444444444444'

/** Harnais : un client neuf par test, dont on espionne les invalidations. */
function harnais() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const espion = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const clesInvalidees = (): QueryKey[] =>
    espion.mock.calls.map(([filtres]) => filtres!.queryKey!)
  return { wrapper, clesInvalidees }
}

/**
 * ORACLE (étape 6, G3) : `gamme_modeles` se lit des DEUX côtés du lien — les
 * modèles d'une gamme (clé `gammes`) et les gammes d'un modèle (clé
 * `modeles_operations`, qui formule la confirmation avant suppression d'un
 * modèle). Une écriture doit donc invalider les deux, sans quoi la seconde vue
 * annonce des gammes liées qui ne le sont plus.
 */
describe('liaisons gamme_modeles — invalidations', () => {
  it('lier des modèles invalide les gammes ET les modèles d’opération', async () => {
    const { wrapper, clesInvalidees } = harnais()
    const { result } = renderHook(() => useLierModelesOperation(), { wrapper })

    result.current.mutate({ gammeId: GAMME, modeleIds: [MODELE] })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(clesInvalidees()).toContainEqual(gammesQueries.all())
    expect(clesInvalidees()).toContainEqual(modelesOperationsQueries.all())
  })

  it('détacher un modèle invalide les gammes ET les modèles d’opération', async () => {
    const { wrapper, clesInvalidees } = harnais()
    const { result } = renderHook(() => useDelierModeleOperation(), { wrapper })

    result.current.mutate({ gammeId: GAMME, modeleId: MODELE })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(clesInvalidees()).toContainEqual(gammesQueries.all())
    expect(clesInvalidees()).toContainEqual(modelesOperationsQueries.all())
  })
})
