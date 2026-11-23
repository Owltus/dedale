import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Database } from '@/lib/database.types'
import { useActionsDemande } from './use-actions-demande'

// Client Supabase inerte : aucun geste n'est déclenché, seul compte le menu.
vi.mock('@/lib/supabase', () => {
  const chaine: unknown = new Proxy(
    {},
    {
      get(_cible, propriete) {
        if (propriete === 'then') return undefined
        return () => chaine
      },
    },
  )
  return { supabase: chaine }
})

type Demande = Database['public']['Tables']['demandes_intervention']['Row']

const MOI = '11111111-1111-1111-1111-111111111111'
const AUTRE = '22222222-2222-2222-2222-222222222222'

function demande(created_by: string, statut_di_id: number): Demande {
  return { id: 'd1', created_by, statut_di_id } as Demande
}

function menu(role: 'demandeur' | 'technicien' | 'lecteur', d: Demande) {
  const qc = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(
    () => useActionsDemande({ siteId: 's1', role, userId: MOI }),
    { wrapper },
  )
  return result.current.actionsDe(d).map((a) => ({
    label: a.label,
    destructive: a.destructive === true,
    separatorBefore: a.separatorBefore === true,
    disabled: a.disabled === true,
  }))
}

/** Gel du menu contextuel d'une demande (libellés, ordre, séparateur). */
describe('useActionsDemande — actionsDe', () => {
  it('technicien : statuts puis Modifier/Supprimer, séparateur sur Modifier', () => {
    expect(menu('technicien', demande(AUTRE, 2))).toEqual([
      {
        label: 'Ouvert',
        destructive: false,
        separatorBefore: false,
        disabled: false,
      },
      {
        label: 'En cours',
        destructive: false,
        separatorBefore: false,
        disabled: true,
      },
      {
        label: 'Clôturé',
        destructive: false,
        separatorBefore: false,
        disabled: false,
      },
      {
        label: 'Modifier',
        destructive: false,
        separatorBefore: true,
        disabled: false,
      },
      {
        label: 'Supprimer',
        destructive: true,
        separatorBefore: false,
        disabled: false,
      },
    ])
  })

  it('demandeur, sa DI ouverte : Modifier/Supprimer sans séparateur', () => {
    expect(menu('demandeur', demande(MOI, 1))).toEqual([
      {
        label: 'Modifier',
        destructive: false,
        separatorBefore: false,
        disabled: false,
      },
      {
        label: 'Supprimer',
        destructive: true,
        separatorBefore: false,
        disabled: false,
      },
    ])
  })

  it('demandeur, DI d’un autre ou plus ouverte : aucun geste', () => {
    expect(menu('demandeur', demande(AUTRE, 1))).toEqual([])
    expect(menu('demandeur', demande(MOI, 2))).toEqual([])
  })

  it('lecteur : aucun geste', () => {
    expect(menu('lecteur', demande(AUTRE, 1))).toEqual([])
  })
})
