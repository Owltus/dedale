import { describe, expect, it } from 'vitest'
import { decalageSuivant, LIGNES_PAR_ONGLET } from '@/lib/pagination'
import { lireCompteursLieu, ongletsVisibles } from './fiche-lieu'

/** Réponse de `fiche_local` (183) pour un rôle métier. */
const METIER = {
  local: { id: 'l-1', nom: 'Chambre 214' },
  compteurs: {
    equipements: 3,
    gammes: { actives: 2, total: 3 },
    ot: { ouverts: 4, total: 9 },
    di: { ouvertes: 1, total: 5 },
    travaux: { ouverts: 0, total: 2 },
    evenements: { ouverts: 1, total: 1 },
    documents: 6,
  },
}

describe('lireCompteursLieu', () => {
  it('lit les compteurs d’un rôle métier (clés « actives » / « ouvertes » comprises)', () => {
    expect(lireCompteursLieu(METIER)).toEqual({
      equipements: 3,
      gammes: { ouverts: 2, total: 3 },
      ot: { ouverts: 4, total: 9 },
      di: { ouverts: 1, total: 5 },
      travaux: { ouverts: 0, total: 2 },
      evenements: { ouverts: 1, total: 1 },
      documents: 6,
    })
  })

  it('compteur NULL (demandeur) → null, jamais 0', () => {
    const c = lireCompteursLieu({
      local: {},
      compteurs: {
        equipements: 2,
        gammes: null,
        ot: null,
        di: { ouvertes: 0, total: 0 },
        travaux: null,
        evenements: null,
        documents: null,
      },
    })
    expect(c).toMatchObject({
      gammes: null,
      ot: null,
      travaux: null,
      evenements: null,
      documents: null,
    })
  })

  it('lieu invisible (NULL global) ou réponse mal formée → null', () => {
    expect(lireCompteursLieu(null)).toBeNull()
    expect(lireCompteursLieu([])).toBeNull()
    expect(lireCompteursLieu({ local: {} })).toBeNull()
  })

  it('compteur partiel (total manquant) → onglet masqué', () => {
    const c = lireCompteursLieu({
      compteurs: { ...METIER.compteurs, ot: { ouverts: 1 } },
    })
    expect(c?.ot).toBeNull()
  })
})

describe('ongletsVisibles', () => {
  it('métier : sept onglets, pastille = non terminés, Documents sans pastille', () => {
    const c = lireCompteursLieu(METIER)
    expect(c).not.toBeNull()
    if (!c) return
    expect(ongletsVisibles(c)).toEqual([
      { id: 'equipements', label: 'Équipements', count: 3, total: 3 },
      { id: 'gammes', label: 'Plans de maintenance', count: 2, total: 3 },
      { id: 'ot', label: 'Ordres de travail', count: 4, total: 9 },
      { id: 'di', label: 'Demandes', count: 1, total: 5 },
      { id: 'travaux', label: 'Travaux', count: 0, total: 2 },
      { id: 'evenements', label: 'Événements', count: 1, total: 1 },
      { id: 'documents', label: 'Documents', total: 6 },
    ])
  })

  it('demandeur : Équipements et Demandes seulement', () => {
    expect(
      ongletsVisibles({
        equipements: 0,
        gammes: null,
        ot: null,
        di: { ouverts: 0, total: 0 },
        travaux: null,
        evenements: null,
        documents: null,
      }).map((o) => o.id),
    ).toEqual(['equipements', 'di'])
  })
})

describe('decalageSuivant', () => {
  const page = (n: number) => Array.from({ length: n }, (_, i) => i)
  it('page incomplète = dernière page', () => {
    expect(decalageSuivant(page(12), [page(12)])).toBeUndefined()
  })
  it('page pleine → décalage = lignes déjà lues', () => {
    const pleine = page(LIGNES_PAR_ONGLET)
    expect(decalageSuivant(pleine, [pleine])).toBe(LIGNES_PAR_ONGLET)
    expect(decalageSuivant(pleine, [pleine, pleine])).toBe(
      2 * LIGNES_PAR_ONGLET,
    )
  })
})
