import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { trierOtParUrgence } from './tri'

/**
 * La liste des OT est chargée en DEUX morceaux (non terminés, puis terminés
 * page par page, triés par la base : date de clôture ↓ sans clôture en
 * dernier, puis date prévue ↑, puis id ↑). Ce test prouve que la
 * concaténation donne EXACTEMENT l'ordre de l'ancien tri sur la liste complète
 * (lue par date prévue ↑, id ↑).
 */
const ot = fc.record({
  id: fc.uuid(),
  statut: fc.constantFrom(
    'planifie',
    'en_cours',
    'reouvert',
    'cloture',
    'annule',
  ),
  date_prevue: fc.option(
    fc
      .date({
        min: new Date('2024-01-01'),
        max: new Date('2027-12-31'),
        noInvalidDate: true,
      })
      .map((d) => d.toISOString().slice(0, 10)),
    { nil: null },
  ),
  date_cloture: fc.option(
    fc
      .date({
        min: new Date('2024-01-01'),
        max: new Date('2026-11-24'),
        noInvalidDate: true,
      })
      .map((d) => d.toISOString().slice(0, 10) + 'T10:00:00+00:00'),
    { nil: null },
  ),
  tolerance_jours: fc.integer({ min: 0, max: 30 }),
})

const parDatePrevue = <T extends { date_prevue: string | null; id: string }>(
  a: T,
  b: T,
) => {
  // Ordre de la requête : date_prevue ↑ (NULL en dernier, comme PostgreSQL), id ↑.
  if (a.date_prevue !== b.date_prevue) {
    if (a.date_prevue === null) return 1
    if (b.date_prevue === null) return -1
    return a.date_prevue < b.date_prevue ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

const ordreBaseTermines = <
  T extends {
    date_cloture: string | null
    date_prevue: string | null
    id: string
  },
>(
  a: T,
  b: T,
) => {
  if (a.date_cloture !== b.date_cloture) {
    if (a.date_cloture === null) return 1
    if (b.date_cloture === null) return -1
    return a.date_cloture > b.date_cloture ? -1 : 1
  }
  return parDatePrevue(a, b)
}

describe('liste des OT par morceaux', () => {
  it('ouverts triés + terminés dans l’ordre de la base = ancien tri complet', () => {
    fc.assert(
      fc.property(fc.array(ot, { maxLength: 60 }), (brut) => {
        const tous = [...brut].sort(parDatePrevue)
        const ancien = trierOtParUrgence(tous).map((o) => o.id)
        const ouverts = tous.filter(
          (o) => o.statut !== 'cloture' && o.statut !== 'annule',
        )
        const termines = tous
          .filter((o) => o.statut === 'cloture' || o.statut === 'annule')
          .sort(ordreBaseTermines)
        const nouveau = [...trierOtParUrgence(ouverts), ...termines].map(
          (o) => o.id,
        )
        expect(nouveau).toEqual(ancien)
      }),
    )
  })
})
