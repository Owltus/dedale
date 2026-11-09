import { describe, expect, it } from 'vitest'
import { isoLocale, parseDateLocale } from '@/lib/date'
import { prochaineDateOt } from './prochaine-date'
import oracle from './prochaine-date.oracle.json'

/**
 * ORACLE : 1 750 résultats de `public.prochaine_date_ot` relevés en production
 * le 09/11/2026 (bases tous les 9 jours de fin 2024 à début 2028 × toutes les
 * périodicités du référentiel + quelques multiples). Le miroir front doit les
 * reproduire À L'IDENTIQUE, sinon la frise afficherait des passages estimés
 * que la base ne générera jamais.
 */
describe('prochaineDateOt (miroir de la migration 123)', () => {
  const cas = oracle as [string, number, string][]

  it('reproduit la base sur tout l’échantillon', () => {
    const ecarts = cas.filter(
      ([base, jours, attendu]) =>
        isoLocale(
          prochaineDateOt(parseDateLocale(base), jours) ?? new Date(0),
        ) !== attendu,
    )
    expect(cas.length).toBeGreaterThan(1000)
    expect(ecarts).toEqual([])
  })

  it('renvoie null pour une gamme ponctuelle', () => {
    expect(prochaineDateOt(new Date(2026, 10, 9), 0)).toBeNull()
  })
})
