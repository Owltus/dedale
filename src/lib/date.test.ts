import { describe, expect, it } from 'vitest'
import { formatDate, formatDateLong } from './date'

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
