import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  actionsCapex,
  anneesBudget,
  ID_DEMANDE,
  ID_REALISE,
  ID_REFUSE,
  ID_VALIDE,
  nomStatutCapex,
  rangStatutCapex,
  schemaCapex,
  statutCapexTone,
  STATUTS_CAPEX_TERMINAUX,
  totauxAnnee,
} from './etat'
import { anneeDeParam } from './annee'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Les quatre statuts du seed `statuts_capex` (138). */
const IDS_CONNUS = [ID_DEMANDE, ID_VALIDE, ID_REALISE, ID_REFUSE] as const
const idConnu = fc.constantFrom(...IDS_CONNUS)
/** Ids hors seed : ce qu'une donnée abîmée produirait. */
const idInconnu = fc.integer({ min: 5, max: 500 })
const annee = fc.integer({ min: 2000, max: 2099 })

const SANS_REFERENTIEL = new Map<number, string>()

describe('rangStatutCapex — ordre du menu', () => {
  it('Demandé → Validé → Réalisé → Refusé', () => {
    const tri = [...IDS_CONNUS].sort(
      (a, b) => rangStatutCapex(a) - rangStatutCapex(b),
    )
    expect(tri).toEqual([ID_DEMANDE, ID_VALIDE, ID_REALISE, ID_REFUSE])
  })

  it('un statut inconnu est rejeté en fin, jamais intercalé', () => {
    fc.assert(
      fc.property(idConnu, idInconnu, (connu, inconnu) => {
        expect(rangStatutCapex(inconnu)).toBeGreaterThan(rangStatutCapex(connu))
      }),
      TIRAGES,
    )
  })
})

describe('nomStatutCapex — totalité', () => {
  it('le référentiel prime, puis le défaut, puis « Statut N »', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        (id, renomme) => {
          const noms = new Map<number, string>()
          if (renomme !== undefined) noms.set(id, renomme)
          const rendu = nomStatutCapex(id, noms)
          if (renomme !== undefined) expect(rendu).toBe(renomme)
          else expect(rendu.length).toBeGreaterThan(0)
        },
      ),
      TIRAGES,
    )
    expect(nomStatutCapex(77, SANS_REFERENTIEL)).toBe('Statut 77')
  })

  it('les quatre libellés par défaut', () => {
    expect(
      IDS_CONNUS.map((id) => nomStatutCapex(id, SANS_REFERENTIEL)),
    ).toEqual(['Demandé', 'Validé', 'Réalisé', 'Refusé'])
  })
})

describe('statutCapexTone — sémantique', () => {
  it('Refusé est rouge, Réalisé vert, et chaque statut a sa couleur', () => {
    expect(statutCapexTone(ID_REFUSE)).toBe('destructive')
    expect(statutCapexTone(ID_REALISE)).toBe('success')
    expect(new Set(IDS_CONNUS.map(statutCapexTone)).size).toBe(4)
  })

  it('terminés = Réalisé et Refusé', () => {
    expect([...STATUTS_CAPEX_TERMINAUX]).toEqual([ID_REALISE, ID_REFUSE])
  })
})

describe('actionsCapex — les boutons de la fiche', () => {
  it('par statut, l’action principale d’abord (plan validé par le PO)', () => {
    const cles = (id: number) => actionsCapex(id, 2026).map((a) => a.cle)
    expect(cles(ID_DEMANDE)).toEqual(['valider', 'refuser', 'reporter'])
    expect(cles(ID_VALIDE)).toEqual(['realiser', 'reporter'])
    expect(cles(ID_REALISE)).toEqual(['rouvrir'])
    expect(cles(ID_REFUSE)).toEqual(['relancer', 'reporter'])
  })

  it('reporter = année suivante, de retour en « Demandé »', () => {
    fc.assert(
      fc.property(idConnu, annee, (id, a) => {
        for (const act of actionsCapex(id, a))
          if (act.cle === 'reporter') {
            expect(act.annee).toBe(a + 1)
            expect(act.statutId).toBe(ID_DEMANDE)
            expect(act.libelle).toBe(`Reporter à ${String(a + 1)}`)
          } else expect(act.annee).toBe(a)
      }),
      TIRAGES,
    )
  })

  it('aucune action ne laisse le dossier où il est', () => {
    fc.assert(
      fc.property(idConnu, annee, (id, a) => {
        for (const act of actionsCapex(id, a))
          expect(act.statutId !== id || act.annee !== a).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('un statut inconnu ne propose rien', () => {
    fc.assert(
      fc.property(idInconnu, (id) => {
        expect(actionsCapex(id, 2026)).toEqual([])
      }),
      TIRAGES,
    )
  })
})

describe('schemaCapex — Demandé → Validé → Réalisé', () => {
  it('trois étapes, deux flèches nommées par l’action', () => {
    const s = schemaCapex(ID_DEMANDE, SANS_REFERENTIEL)
    expect(s.etapes.map((e) => e.libelle)).toEqual([
      'Demandé',
      'Validé',
      'Réalisé',
    ])
    expect(s.fleches.map((f) => f.libelle)).toEqual([
      'Valider',
      'Marquer réalisé',
    ])
  })

  it('le dossier est repéré par UNE étape ; avant cochée, après à venir', () => {
    for (const id of [ID_DEMANDE, ID_VALIDE, ID_REALISE]) {
      const { etapes, fleches } = schemaCapex(id, SANS_REFERENTIEL)
      const i = etapes.findIndex((e) => e.etat === 'actuel')
      expect(etapes[i]?.statutId).toBe(id)
      expect(etapes.filter((e) => e.etat === 'actuel')).toHaveLength(1)
      expect(etapes.slice(0, i).every((e) => e.etat === 'fait')).toBe(true)
      expect(etapes.slice(i + 1).every((e) => e.etat === 'avenir')).toBe(true)
      expect(fleches.map((f) => f.franchie)).toEqual(
        fleches.map((_, j) => j < i),
      )
    }
  })

  it('Refusé (ignoré par le schéma) et l’inconnu n’allument rien', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(ID_REFUSE), idInconnu), (id) => {
        const { etapes, fleches } = schemaCapex(id, SANS_REFERENTIEL)
        expect(etapes.every((e) => e.etat === 'avenir')).toBe(true)
        expect(fleches.every((f) => !f.franchie)).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('suit un renommage du référentiel', () => {
    const noms = new Map([[ID_DEMANDE, 'Sollicité']])
    expect(schemaCapex(ID_DEMANDE, noms).etapes[0]?.libelle).toBe('Sollicité')
  })
})

describe('années de budget', () => {
  it('toujours l’année en cours et la suivante, sans doublon, récente d’abord', () => {
    fc.assert(
      fc.property(fc.array(annee), annee, (annees, courante) => {
        const res = anneesBudget(annees, courante)
        expect(res).toContain(courante)
        expect(res).toContain(courante + 1)
        expect(new Set(res).size).toBe(res.length)
        expect(res).toEqual([...res].sort((a, b) => b - a))
        for (const a of annees) expect(res).toContain(a)
      }),
      TIRAGES,
    )
  })

  it('totaux : refus exclus du demandé, validé = validés + réalisés', () => {
    const t = totauxAnnee([
      {
        statut_capex_id: ID_DEMANDE,
        montant_demande: 100,
        montant_prevu: null,
        depense_reelle: null,
      },
      {
        statut_capex_id: ID_VALIDE,
        montant_demande: 200,
        montant_prevu: 180,
        depense_reelle: null,
      },
      {
        statut_capex_id: ID_REALISE,
        montant_demande: 300,
        montant_prevu: 300,
        depense_reelle: 320,
      },
      {
        statut_capex_id: ID_REFUSE,
        montant_demande: 1000,
        montant_prevu: null,
        depense_reelle: null,
      },
    ])
    expect(t).toEqual({ nb: 4, demande: 600, valide: 500 })
  })

  it('adresse : quatre chiffres entre 2000 et 2100, sinon rien', () => {
    expect(anneeDeParam('2027')).toBe(2027)
    expect(anneeDeParam('renovation-porte-bagages')).toBeNull()
    expect(anneeDeParam('1999')).toBeNull()
    expect(anneeDeParam('20270')).toBeNull()
  })
})
