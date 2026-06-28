import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateAvecSemaineIso,
  formatDateLong,
  numeroSemaineIso,
} from './date'

describe('formatDate', () => {
  it('formate une date ISO en JJ/MM/AAAA', () => {
    expect(formatDate('2026-06-07T10:00:00')).toBe('07/06/2026')
  })

  it('accepte un objet Date', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('05/01/2026')
  })

  it('renvoie « — » pour vide, null ou undefined', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
  })

  it('renvoie « — » pour une date invalide', () => {
    expect(formatDate('pas-une-date')).toBe('—')
  })
})

describe('formatDateLong', () => {
  it('formate en format long (fr)', () => {
    expect(formatDateLong('2026-06-07T10:00:00')).toBe('7 juin 2026')
  })

  it('renvoie « — » pour vide ou invalide', () => {
    expect(formatDateLong(null)).toBe('—')
    expect(formatDateLong('xxx')).toBe('—')
  })
})

// Dates construites en LOCAL (new Date(an, mois, jour)) → composantes calendaires
// non ambiguës quel que soit le fuseau du runner de tests.
describe('numeroSemaineIso', () => {
  it('numérote selon la norme ISO/FR (lundi, semaine du 4 janvier)', () => {
    expect(numeroSemaineIso(new Date(2026, 5, 26))).toBe(26) // 26/06/2026
    expect(numeroSemaineIso(new Date(2026, 0, 1))).toBe(1) // 01/01/2026 (jeudi) = S1
    // 29/12/2025 (lundi) appartient à la semaine 1 de 2026.
    expect(numeroSemaineIso(new Date(2025, 11, 29))).toBe(1)
    // 01/01/2023 (dimanche) appartient à la semaine 52 de 2022.
    expect(numeroSemaineIso(new Date(2023, 0, 1))).toBe(52)
    // 2020 est une année ISO « longue » à 53 semaines.
    expect(numeroSemaineIso(new Date(2020, 11, 31))).toBe(53)
  })

  it('renvoie null pour vide ou invalide', () => {
    expect(numeroSemaineIso(null)).toBeNull()
    expect(numeroSemaineIso('pas-une-date')).toBeNull()
  })
})

describe('formatDateAvecSemaineIso', () => {
  it('ajoute le numéro de semaine ISO entre parenthèses', () => {
    expect(formatDateAvecSemaineIso(new Date(2026, 5, 26))).toBe(
      '26/06/2026 (26)',
    )
  })

  it('renvoie « — » (sans semaine) pour vide ou invalide', () => {
    expect(formatDateAvecSemaineIso(null)).toBe('—')
  })
})
