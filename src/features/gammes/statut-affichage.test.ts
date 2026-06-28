import { describe, expect, it } from 'vitest'
import {
  statutAffichageGamme,
  statutAffichageAgrege,
} from './statut-affichage'
import type { OtTriable } from '../ordres-travail/tri'

// « Aujourd'hui » FIXE (jeu. 15 jan. 2026) pour rendre les statuts temporels
// déterministes. Lundi de la semaine = 12 jan. ; lundi suivant = 19 jan.
const AUJ = new Date(2026, 0, 15)

function ot(p: Partial<OtTriable> & { statut: string }): OtTriable {
  return {
    origine: 'plan',
    date_prevue: '2030-01-01', // loin par défaut (hors tolérance)
    date_cloture: null,
    tolerance_jours: 7,
    ...p,
  }
}

describe('statutAffichageGamme', () => {
  it('gamme désactivée → « Inactive » (gris), même avec un OT urgent', () => {
    const r = statutAffichageGamme({
      estActive: false,
      ots: [ot({ statut: 'reouvert' })],
      aujourdHui: AUJ,
    })
    expect(r).toEqual({ label: 'Inactive', tone: 'neutral', temporel: false })
  })

  it('gamme active sans aucun OT → « Non assigné » (gris)', () => {
    const r = statutAffichageGamme({ estActive: true, ots: [], aujourdHui: AUJ })
    expect(r).toEqual({ label: 'Non assigné', tone: 'neutral', temporel: false })
  })

  it('remonte l’OT le plus urgent : réouvert prime sur en retard', () => {
    const r = statutAffichageGamme({
      estActive: true,
      ots: [
        ot({ statut: 'planifie', date_prevue: '2020-01-01' }), // en retard
        ot({ statut: 'reouvert' }),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'Rouvert', tone: 'warning' })
  })

  it('un OT en retard (sans réouvert) → « En retard » (rouge)', () => {
    const r = statutAffichageGamme({
      estActive: true,
      ots: [
        ot({ statut: 'planifie', date_prevue: '2020-01-01' }), // en retard
        ot({ statut: 'cloture', date_cloture: '2026-01-01' }),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'En retard', tone: 'destructive' })
  })

  it('un OT en cours (ni retard ni réouvert) → « En cours » (bleu)', () => {
    const r = statutAffichageGamme({
      estActive: true,
      ots: [
        ot({ statut: 'en_cours' }),
        ot({ statut: 'planifie', date_prevue: '2030-01-01' }),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'En cours', tone: 'info' })
  })

  it('prochain OT imminent → proximité temporelle (« Cette semaine », jaune)', () => {
    const r = statutAffichageGamme({
      estActive: true,
      // 16 jan. 2026 = dans la semaine ISO courante.
      ots: [
        ot({ statut: 'planifie', date_prevue: '2026-01-16', tolerance_jours: 30 }),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'Cette semaine', tone: 'yellow' })
  })

  it('tous les OT terminés → « À jour » (vert)', () => {
    const r = statutAffichageGamme({
      estActive: true,
      ots: [
        ot({ statut: 'cloture', date_cloture: '2026-01-01' }),
        ot({ statut: 'annule', date_cloture: '2025-12-01' }),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toEqual({ label: 'À jour', tone: 'success', temporel: false })
  })

  it('prochain OT planifié encore loin (hors tolérance) → « À jour » (vert)', () => {
    const r = statutAffichageGamme({
      estActive: true,
      ots: [
        ot({ statut: 'planifie', date_prevue: '2030-01-01', tolerance_jours: 7 }),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toEqual({ label: 'À jour', tone: 'success', temporel: false })
  })
})

// Sous-catégorie = pire cas parmi toutes ses gammes (« super-gamme »), MÊME grille
// de lecture que la gamme.
describe('statutAffichageAgrege', () => {
  const active = (...ots: OtTriable[]) => ({ estActive: true, ots })
  const inactive = (...ots: OtTriable[]) => ({ estActive: false, ots })

  it('aucune gamme → « Vide » (gris)', () => {
    expect(
      statutAffichageAgrege({ gammes: [], aujourdHui: AUJ }),
    ).toEqual({ label: 'Vide', tone: 'neutral', temporel: false })
  })

  it('toutes les gammes désactivées → « Inactive » (gris)', () => {
    const r = statutAffichageAgrege({
      gammes: [inactive(ot({ statut: 'reouvert' })), inactive()],
      aujourdHui: AUJ,
    })
    expect(r).toEqual({ label: 'Inactive', tone: 'neutral', temporel: false })
  })

  it('un OT en retard n’importe où → « En retard » (rouge)', () => {
    const r = statutAffichageAgrege({
      gammes: [
        active(ot({ statut: 'planifie', date_prevue: '2020-01-01' })),
        active(ot({ statut: 'cloture', date_cloture: '2026-01-01' })),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'En retard', tone: 'destructive' })
  })

  it('cohérence avec la gamme : réouvert prime sur en retard', () => {
    const r = statutAffichageAgrege({
      gammes: [
        active(ot({ statut: 'reouvert' })),
        active(ot({ statut: 'planifie', date_prevue: '2020-01-01' })),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'Rouvert', tone: 'warning' })
  })

  it('rien d’urgent mais une gamme sans OT → « À assigner » (gris)', () => {
    const r = statutAffichageAgrege({
      gammes: [
        active(ot({ statut: 'planifie', date_prevue: '2030-01-01' })), // à jour (loin)
        active(), // gamme sans OT
      ],
      aujourdHui: AUJ,
    })
    expect(r).toEqual({ label: 'À assigner', tone: 'neutral', temporel: false })
  })

  it('un OT urgent prime sur « À assigner »', () => {
    const r = statutAffichageAgrege({
      gammes: [
        active(ot({ statut: 'planifie', date_prevue: '2020-01-01' })), // en retard
        active(), // gamme sans OT
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'En retard', tone: 'destructive' })
  })

  it('rien d’urgent, prochain OT imminent → proximité (« Cette semaine »)', () => {
    const r = statutAffichageAgrege({
      gammes: [
        active(
          ot({ statut: 'planifie', date_prevue: '2026-01-16', tolerance_jours: 30 }),
        ),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toMatchObject({ label: 'Cette semaine', tone: 'yellow' })
  })

  it('tout terminé ou planifié loin, aucune gamme vide → « À jour » (vert)', () => {
    const r = statutAffichageAgrege({
      gammes: [
        active(ot({ statut: 'cloture', date_cloture: '2026-01-01' })),
        active(ot({ statut: 'planifie', date_prevue: '2030-01-01' })),
      ],
      aujourdHui: AUJ,
    })
    expect(r).toEqual({ label: 'À jour', tone: 'success', temporel: false })
  })
})
