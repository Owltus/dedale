import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { localCascadeWarning } from './queries'

const SUITE =
  ' : ces liens seront retirés (les éléments eux-mêmes sont conservés).'

describe('localCascadeWarning — énumération française', () => {
  it('aucun lien → null', () => {
    expect(localCascadeWarning({ di: 0, travaux: 0, documents: 0 })).toBe(null)
  })

  it('un seul type de lien', () => {
    expect(localCascadeWarning({ di: 1, travaux: 0, documents: 0 })).toBe(
      `Ce local est référencé par 1 demande d’intervention${SUITE}`,
    )
  })

  it('deux types de liens', () => {
    expect(localCascadeWarning({ di: 0, travaux: 2, documents: 1 })).toBe(
      `Ce local est référencé par 2 tâches de travaux et 1 document${SUITE}`,
    )
  })

  it('trois types de liens', () => {
    expect(localCascadeWarning({ di: 2, travaux: 1, documents: 3 })).toBe(
      `Ce local est référencé par 2 demandes d’intervention, 1 tâche de travaux et 3 documents${SUITE}`,
    )
  })
})
