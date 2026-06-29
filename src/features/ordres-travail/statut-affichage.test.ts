import { describe, expect, it } from 'vitest'
import {
  NIVEAU_URGENCE,
  estPlanifieEnRetard,
  niveauUrgenceOt,
  statutAffichageOt,
} from './statut-affichage'

// « Aujourd'hui » FIXE (jeu. 15 jan. 2026) → statuts temporels déterministes.
// Lundi de la semaine courante = 12 jan. ; lundi précédent (dim. inclus) = 11 jan.
const AUJ = new Date(2026, 0, 15)

describe('estPlanifieEnRetard', () => {
  const enRetard = (date_prevue: string | null, statut = 'planifie') =>
    estPlanifieEnRetard({ statut, date_prevue }, AUJ)

  it('date prévue passée (avant le lundi courant) → en retard', () => {
    expect(enRetard('2020-01-01')).toBe(true)
    expect(enRetard('2026-01-11')).toBe(true) // dimanche, avant le lundi 12
  })

  it('lundi courant ou futur → pas en retard', () => {
    expect(enRetard('2026-01-12')).toBe(false) // le lundi même
    expect(enRetard('2026-01-16')).toBe(false) // plus tard dans la semaine
    expect(enRetard('2030-01-01')).toBe(false)
  })

  it('un OT non planifié n’est jamais « en retard » (même avec une date passée)', () => {
    expect(enRetard('2020-01-01', 'en_cours')).toBe(false)
    expect(enRetard('2020-01-01', 'reouvert')).toBe(false)
  })

  it('date prévue absente → pas en retard', () => {
    expect(enRetard(null)).toBe(false)
  })
})

describe('niveauUrgenceOt', () => {
  const niveau = (statut: string, date_prevue: string | null = '2030-01-01') =>
    niveauUrgenceOt({ statut, date_prevue }, AUJ)

  it('réouvert / en cours = états métier urgents', () => {
    expect(niveau('reouvert')).toBe(NIVEAU_URGENCE.reouvert)
    expect(niveau('en_cours')).toBe(NIVEAU_URGENCE.enCours)
  })

  it('clôturé / annulé = terminal (niveau le plus bas)', () => {
    expect(niveau('cloture')).toBe(NIVEAU_URGENCE.termine)
    expect(niveau('annule')).toBe(NIVEAU_URGENCE.termine)
  })

  it('planifié passé → en retard ; planifié futur → à venir', () => {
    expect(niveau('planifie', '2020-01-01')).toBe(NIVEAU_URGENCE.enRetard)
    expect(niveau('planifie', '2030-01-01')).toBe(NIVEAU_URGENCE.aVenir)
  })

  it('la PROXIMITÉ n’est PAS de l’urgence : un OT « cette semaine » reste « à venir »', () => {
    // 16 jan. = dans la semaine courante (badge « Cette semaine ») mais pas en retard.
    expect(niveau('planifie', '2026-01-16')).toBe(NIVEAU_URGENCE.aVenir)
  })

  it('les niveaux sont strictement ordonnés (réouvert < en retard < en cours < à venir < terminé)', () => {
    expect(NIVEAU_URGENCE.reouvert).toBeLessThan(NIVEAU_URGENCE.enRetard)
    expect(NIVEAU_URGENCE.enRetard).toBeLessThan(NIVEAU_URGENCE.enCours)
    expect(NIVEAU_URGENCE.enCours).toBeLessThan(NIVEAU_URGENCE.aVenir)
    expect(NIVEAU_URGENCE.aVenir).toBeLessThan(NIVEAU_URGENCE.termine)
  })
})

// Proximité CALENDAIRE du libellé, DÉCOUPLÉE de la tolérance (régression de la capture
// du 29/06 : des OT « semaine prochaine » / « ce mois-ci » s'affichaient « Programmé »).
describe('statutAffichageOt — proximité calendaire découplée de la tolérance', () => {
  const aff = (
    datePrevue: string | null,
    toleranceJours: number,
    statut = 'planifie',
  ) =>
    statutAffichageOt({
      statut,
      origine: 'plan',
      datePrevue,
      toleranceJours,
      aujourdHui: AUJ,
    })

  it('OT de la semaine prochaine → « Semaine prochaine », même hors tolérance', () => {
    // 22 jan. = semaine ISO suivante ; tolérance courte (2 j) → AVANT : « Planifié ».
    expect(aff('2026-01-22', 2).label).toBe('Semaine prochaine')
  })

  it('OT de la semaine en cours → « Cette semaine », même hors tolérance', () => {
    expect(aff('2026-01-16', 1).label).toBe('Cette semaine')
  })

  it('OT à ~3 semaines → « Ce mois-ci », même hors tolérance', () => {
    // 5 fév. ≈ 21 j ; tolérance 2 → AVANT : « Planifié ».
    expect(aff('2026-02-05', 2).label).toBe('Ce mois-ci')
  })

  it('OT à ~6 semaines → « Mois prochain »', () => {
    expect(aff('2026-02-28', 2).label).toBe('Mois prochain') // ~44 j
  })

  it('OT à plus de 2 mois → repli « Planifié » (non temporel)', () => {
    const r = aff('2026-05-01', 2) // ~106 j
    expect(r.label).toBe('Planifié')
    expect(r.temporel).toBe(false)
  })

  it('plus d’inversion : un OT plus PROCHE n’est jamais moins précis qu’un OT plus LOINTAIN', () => {
    // Reproduit le bug : machine à glaçons (proche, petite tolérance) montrait
    // « Programmé » tandis que le sas (plus loin, grande tolérance) montrait « Ce mois-ci ».
    expect(aff('2026-02-02', 2).label).toBe('Ce mois-ci') // ~18 j, tolérance courte
    expect(aff('2026-02-12', 60).label).toBe('Ce mois-ci') // ~28 j, grande tolérance
  })

  it('`temporel` suit la TOLÉRANCE (imminence métier), pas le libellé', () => {
    // Même libellé « Semaine prochaine » dans les deux cas, mais `temporel` ne dépend
    // que de la tolérance → pilote la synthèse gamme, pas l'affichage de l'OT.
    expect(aff('2026-01-22', 2).temporel).toBe(false) // hors tolérance
    expect(aff('2026-01-22', 30).temporel).toBe(true) // dans la tolérance
  })
})

// Garantie ANTI-DIVERGENCE : le badge « En retard » et le niveau d'urgence
// `enRetard` reposent sur le MÊME fait (estPlanifieEnRetard) → ils sont toujours
// d'accord. Si l'un changeait sans l'autre, ce test casserait.
describe('cohérence badge ↔ niveau d’urgence (planifié)', () => {
  const dates = ['2020-01-01', '2026-01-11', '2026-01-12', '2026-01-16', '2030-01-01']
  for (const date_prevue of dates) {
    it(`« En retard » au badge ⟺ niveau enRetard (${date_prevue})`, () => {
      const badgeEnRetard =
        statutAffichageOt({
          statut: 'planifie',
          origine: 'plan',
          datePrevue: date_prevue,
          toleranceJours: 7,
          aujourdHui: AUJ,
        }).label === 'En retard'
      const niveauEnRetard =
        niveauUrgenceOt({ statut: 'planifie', date_prevue }, AUJ) ===
        NIVEAU_URGENCE.enRetard
      expect(badgeEnRetard).toBe(niveauEnRetard)
    })
  }
})
