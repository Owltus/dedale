import { describe, expect, it } from 'vitest'
import {
  ajouterJours,
  ajouterSemaines,
  formatDate,
  formatDateAvecSemaineIso,
  formatDateLong,
  isoLocale,
  lundiDeLaSemaine,
  minuit,
  numeroSemaineIso,
  parseDateLocale,
  semaineIso,
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

describe('semaineIso', () => {
  it("renvoie l'année ISO, pas l'année civile, en bord d'année", () => {
    // 29/12/2025 (lundi) → semaine 1 de 2026.
    expect(semaineIso(new Date(2025, 11, 29))).toEqual({
      numero: 1,
      annee: 2026,
    })
    // 01/01/2026 (jeudi) → semaine 1 de 2026.
    expect(semaineIso(new Date(2026, 0, 1))).toEqual({
      numero: 1,
      annee: 2026,
    })
    // 01/01/2023 (dimanche) → semaine 52 de 2022.
    expect(semaineIso(new Date(2023, 0, 1))).toEqual({
      numero: 52,
      annee: 2022,
    })
  })

  it('gère les années ISO « longues » à 53 semaines', () => {
    // 2020 (bissextile commençant un mercredi) compte 53 semaines ISO.
    expect(semaineIso(new Date(2020, 11, 31))).toEqual({
      numero: 53,
      annee: 2020,
    })
    // 01/01/2021 (vendredi) appartient encore à la semaine 53 de 2020…
    expect(semaineIso(new Date(2021, 0, 1))).toEqual({
      numero: 53,
      annee: 2020,
    })
    // …et le lundi 04/01/2021 ouvre la semaine 1 de 2021 (piège de
    // l'approximation « jours depuis le 1er janvier » : elle renvoyait 2).
    expect(semaineIso(new Date(2021, 0, 4))).toEqual({
      numero: 1,
      annee: 2021,
    })
    // 2026 commence un jeudi → 53 semaines ; le 01/01/2027 (vendredi) y reste.
    expect(semaineIso(new Date(2026, 11, 31))).toEqual({
      numero: 53,
      annee: 2026,
    })
    expect(semaineIso(new Date(2027, 0, 1))).toEqual({
      numero: 53,
      annee: 2026,
    })
    expect(semaineIso(new Date(2027, 0, 4))).toEqual({
      numero: 1,
      annee: 2027,
    })
  })

  it('reste cohérente avec numeroSemaineIso (source unique)', () => {
    for (const d of [
      new Date(2025, 11, 29),
      new Date(2026, 5, 26),
      new Date(2027, 0, 1),
    ]) {
      expect(semaineIso(d).numero).toBe(numeroSemaineIso(d))
    }
  })
})

describe('parseDateLocale', () => {
  it('parse une date nue YYYY-MM-DD en Date locale à minuit', () => {
    const d = parseDateLocale('2026-07-02')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(2)
    expect(d.getHours()).toBe(0)
  })

  it("ne garde que la partie date d'un ISO complet (pas de décalage UTC)", () => {
    // `new Date('2026-07-02T23:30:00Z')` donnerait le 3 juillet en UTC+2 ;
    // parseDateLocale lit les composantes calendaires telles quelles.
    const d = parseDateLocale('2026-07-02T23:30:00Z')
    expect(isoLocale(d)).toBe('2026-07-02')
  })
})

describe('lundiDeLaSemaine', () => {
  it('renvoie le lundi à minuit local, sans muter l’entrée', () => {
    const dimanche = new Date(2026, 6, 5, 15, 30) // dimanche 05/07/2026
    const lundi = lundiDeLaSemaine(dimanche)
    expect(isoLocale(lundi)).toBe('2026-06-29')
    expect(lundi.getHours()).toBe(0)
    expect(dimanche.getHours()).toBe(15) // entrée intacte
  })

  it('laisse un lundi inchangé (ramené à minuit)', () => {
    expect(isoLocale(lundiDeLaSemaine(new Date(2026, 5, 29, 9)))).toBe(
      '2026-06-29',
    )
  })

  it("traverse le bord d'année (jeudi 01/01/2026 → lundi 29/12/2025)", () => {
    expect(isoLocale(lundiDeLaSemaine(new Date(2026, 0, 1)))).toBe(
      '2025-12-29',
    )
  })
})

describe('minuit / ajouterJours / ajouterSemaines', () => {
  it('minuit copie la date au 00:00 local', () => {
    const d = new Date(2026, 6, 2, 18, 45)
    expect(minuit(d).getTime()).toBe(new Date(2026, 6, 2).getTime())
    expect(d.getHours()).toBe(18)
  })

  it('ajouterJours décale en calendaire (mois/année traversés)', () => {
    expect(isoLocale(ajouterJours(new Date(2026, 11, 30), 3))).toBe(
      '2027-01-02',
    )
    expect(isoLocale(ajouterJours(new Date(2026, 0, 1), -1))).toBe(
      '2025-12-31',
    )
  })

  it('ajouterSemaines reste à minuit local malgré les changements d’heure', () => {
    // 26 semaines depuis le 05/01/2026 traversent le passage à l'heure d'été.
    const res = ajouterSemaines(new Date(2026, 0, 5), 26)
    expect(isoLocale(res)).toBe('2026-07-06')
    expect(res.getHours()).toBe(0)
  })
})
