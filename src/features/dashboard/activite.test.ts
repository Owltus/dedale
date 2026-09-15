import { describe, expect, it } from 'vitest'
import { lignesDemandes, lignesEvenements, lignesTravaux } from './activite'

const STATUTS_TRAVAUX = new Map([
  [1, 'Ouvert'],
  [2, 'En cours'],
  [4, 'Terminé'],
])
const STATUTS_EVENEMENTS = new Map([
  [1, 'Ouvert'],
  [2, 'En cours'],
  [4, 'Clôturé'],
])

describe('lignesDemandes', () => {
  const rows = [
    {
      id: 'a',
      constat: 'Fuite au sous-sol',
      date_constat: '2026-09-10',
      statut_di_id: 3,
    },
    {
      id: 'b',
      constat: 'Porte bloquée\nseconde ligne ignorée',
      date_constat: '2026-09-08',
      statut_di_id: 1,
    },
  ]

  it('remonte les demandes non clôturées en tête', () => {
    expect(lignesDemandes(rows).map((l) => l.id)).toEqual(['b', 'a'])
  })

  it('titre = première ligne du constat, slug dérivé du titre', () => {
    const [ouverte] = lignesDemandes(rows)
    expect(ouverte?.titre).toBe('Porte bloquée')
    expect(ouverte?.slug).toBe('porte-bloquee')
    expect(ouverte?.statut).toBe('Ouvert')
  })

  it('désambiguïse le slug de deux titres identiques', () => {
    const doublons = [
      { ...rows[1]!, id: 'aaaaaaaa-1111' },
      { ...rows[1]!, id: 'bbbbbbbb-2222' },
    ]
    const slugs = lignesDemandes(doublons).map((l) => l.slug)
    expect(new Set(slugs).size).toBe(2)
    expect(slugs[0]).toContain('~')
  })
})

describe('lignesTravaux', () => {
  const rows = [
    {
      id: 't1',
      titre: 'Réfection toiture',
      date_demande: '2026-08-01',
      date_fin: '2026-09-01',
      statut_travaux_id: 4,
    },
    {
      id: 't2',
      titre: 'Peinture hall',
      date_demande: '2026-07-01',
      date_fin: null,
      statut_travaux_id: 2,
    },
  ]

  it('remonte les travaux non terminés et libelle le statut depuis le référentiel', () => {
    const lignes = lignesTravaux(rows, STATUTS_TRAVAUX)
    expect(lignes.map((l) => l.id)).toEqual(['t2', 't1'])
    expect(lignes[0]?.statut).toBe('En cours')
    // `termine` désigne l'onglet à ouvrir par défaut (celui où il reste à faire).
    expect(lignes.map((l) => l.termine)).toEqual([false, true])
  })

  it('affiche la date de fin sur un travaux terminé, la date de demande sinon', () => {
    const lignes = lignesTravaux(rows, STATUTS_TRAVAUX)
    expect(lignes[0]?.sousTitre).toContain('01/07/2026')
    expect(lignes[1]?.sousTitre).toContain('01/09/2026')
  })
})

describe('lignesEvenements', () => {
  const rows = [
    {
      id: 'e1',
      titre: 'Coupure électrique',
      date_evenement: '2026-09-02',
      date_cloture: '2026-09-03',
      statut_evenement_id: 4,
    },
    {
      id: 'e2',
      titre: 'Dégât des eaux',
      date_evenement: '2026-09-01',
      date_cloture: null,
      statut_evenement_id: 1,
    },
  ]

  it('remonte les événements non clôturés et suit la date du statut affiché', () => {
    const lignes = lignesEvenements(rows, STATUTS_EVENEMENTS)
    expect(lignes.map((l) => l.id)).toEqual(['e2', 'e1'])
    expect(lignes[0]?.statut).toBe('Ouvert')
    expect(lignes[1]?.sousTitre).toContain('03/09/2026')
  })
})
