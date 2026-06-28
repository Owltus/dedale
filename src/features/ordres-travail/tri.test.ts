import { describe, expect, it } from 'vitest'
import { trierOtParUrgence, type OtTriable } from './tri'

// Dates volontairement EXTRÊMES pour rendre le statut temporel déterministe quel
// que soit « aujourd'hui » (le helper appelle `statutAffichageOt` avec la date du
// jour) : 2020 = largement en retard, 2030 = largement à venir.
const PASSE = '2020-01-01'
const FUTUR = '2030-01-01'

function ot(p: Partial<OtTriable> & { statut: string }): OtTriable {
  return {
    origine: 'plan',
    date_prevue: FUTUR,
    date_cloture: null,
    tolerance_jours: 7,
    ...p,
  }
}

describe('trierOtParUrgence', () => {
  it('ordonne les groupes par urgence : réouvert → en retard → en cours → à venir → terminé', () => {
    const entree = [
      ot({ statut: 'cloture', date_cloture: '2026-01-01' }),
      ot({ statut: 'planifie', date_prevue: FUTUR }), // à venir
      ot({ statut: 'en_cours' }),
      ot({ statut: 'planifie', date_prevue: PASSE }), // en retard
      ot({ statut: 'reouvert' }),
    ]
    const statuts = trierOtParUrgence(entree).map((o) => ({
      statut: o.statut,
      date: o.date_prevue,
    }))
    expect(statuts).toEqual([
      { statut: 'reouvert', date: FUTUR },
      { statut: 'planifie', date: PASSE },
      { statut: 'en_cours', date: FUTUR },
      { statut: 'planifie', date: FUTUR },
      { statut: 'cloture', date: FUTUR },
    ])
  })

  it('trie les OT à faire par date prévue croissante (le prochain en haut)', () => {
    const entree = [
      ot({ statut: 'planifie', date_prevue: '2030-03-01' }),
      ot({ statut: 'planifie', date_prevue: '2030-01-01' }),
      ot({ statut: 'planifie', date_prevue: '2030-02-01' }),
    ]
    expect(trierOtParUrgence(entree).map((o) => o.date_prevue)).toEqual([
      '2030-01-01',
      '2030-02-01',
      '2030-03-01',
    ])
  })

  it('trie les OT terminés par date de clôture décroissante (le plus récent en haut)', () => {
    const entree = [
      ot({ statut: 'cloture', date_cloture: '2026-01-10' }),
      ot({ statut: 'annule', date_cloture: '2026-03-20' }),
      ot({ statut: 'cloture', date_cloture: '2026-02-15' }),
    ]
    expect(trierOtParUrgence(entree).map((o) => o.date_cloture)).toEqual([
      '2026-03-20',
      '2026-02-15',
      '2026-01-10',
    ])
  })

  it('place les dates nulles en dernier dans leur groupe', () => {
    const entree = [
      ot({ statut: 'cloture', date_cloture: null }),
      ot({ statut: 'cloture', date_cloture: '2026-05-01' }),
    ]
    expect(trierOtParUrgence(entree).map((o) => o.date_cloture)).toEqual([
      '2026-05-01',
      null,
    ])
  })

  it('ne mute pas le tableau d’entrée', () => {
    const entree = [
      ot({ statut: 'cloture', date_cloture: '2026-01-01' }),
      ot({ statut: 'reouvert' }),
    ]
    const copie = [...entree]
    trierOtParUrgence(entree)
    expect(entree).toEqual(copie)
  })
})
