import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { QueryKey } from '@tanstack/react-query'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import { documentsQueries } from '@/features/documents/queries'
import { dashboardQueries } from './queries'
import { useDashboardRealtime } from './use-dashboard-data'

// Le hook réel ouvre un canal Supabase : on l'espionne, on ne l'exécute pas.
vi.mock('@/hooks/use-realtime-refresh', () => ({
  useRealtimeRefresh: vi.fn(),
}))

// Les modules de requêtes construisent le client Supabase à l'import.
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

const abonnement = vi.mocked(useRealtimeRefresh)

/** Clés déclarées par l'abonnement à `table` (une seule liste attendue). */
function clesDe(table: string): QueryKey[] {
  const appel = abonnement.mock.calls.find(([nom]) => nom === table)
  expect(appel, `aucun abonnement posé sur « ${table} »`).toBeDefined()
  const cles = appel![1]
  // Le hook accepte une clé SEULE ou une liste : on normalise comme lui.
  return cles.length > 0 && cles.every((el) => Array.isArray(el))
    ? ([...cles] as QueryKey[])
    : [cles as QueryKey]
}

describe('useDashboardRealtime', () => {
  beforeEach(() => {
    abonnement.mockClear()
    renderHook(() => {
      useDashboardRealtime()
    })
  })

  it('un changement de document rafraîchit AUSSI le tableau de bord', () => {
    // L'alerte « justificatifs manquants » lit `documents_ordres_travail` mais
    // vit sous `['dashboard']` : sans cette clé, joindre le justificatif
    // laissait l'alerte affichée, et l'utilisateur concluait que son envoi
    // n'avait pas marché.
    const cles = clesDe('documents')
    expect(cles).toContainEqual(documentsQueries.all())
    expect(cles).toContainEqual(dashboardQueries.all())
  })

  it('un changement d’OT rafraîchit aussi le tableau de bord', () => {
    // Acquis antérieur, gardé sous filet : mêmes cadrans, même dépendance.
    expect(clesDe('ordres_travail')).toContainEqual(dashboardQueries.all())
  })
})
