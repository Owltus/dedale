import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { QueryKey } from '@tanstack/react-query'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
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

  it('n’écoute que des tables publiées en temps réel (pas documents, contrats, gammes)', () => {
    // Décision PO du 24/11/2026 : les écoutes de tables non publiées ne
    // recevaient jamais rien et ont été retirées.
    const tables = abonnement.mock.calls.map(([nom]) => nom)
    for (const morte of ['documents', 'contrats', 'gammes']) {
      expect(tables).not.toContain(morte)
    }
  })

  it('l’alerte « documents manquants » est relue à chaque arrivée (staleTime 0)', () => {
    // Remplace l'ancienne écoute `documents`, qui ne fonctionnait pas : joindre
    // le document depuis une fiche OT fait disparaître l'alerte au retour.
    expect(dashboardQueries.documentsManquants('S').staleTime).toBe(0)
  })

  it('un changement d’OT rafraîchit aussi le tableau de bord', () => {
    // Acquis antérieur, gardé sous filet : mêmes cadrans, même dépendance.
    expect(clesDe('ordres_travail')).toContainEqual(dashboardQueries.all())
  })
})
