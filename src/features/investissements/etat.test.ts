import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  decisionsCapex,
  etapeAtteinteCapex,
  ID_ACCORDE,
  ID_ANNULE,
  ID_CLOTURE,
  ID_DEMANDE,
  ID_REFUSE,
  ID_REPORTE,
  ID_VALIDE,
  ISSUES_ARRET,
  libelleDecision,
  nomStatutCapex,
  rangStatutCapex,
  schemaParcoursCapex,
  statutCapexTone,
  STATUTS_CAPEX_TERMINAUX,
} from './etat'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Ids du seed `statuts_capex` (1-7), refus compris. */
// 8 = « Annulé », ajouté par la migration 121 ; 9 = « Reporté » (137).
const IDS_CONNUS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const
const idConnu = fc.constantFrom(...IDS_CONNUS)
/** Ids hors seed : ce qu'une migration future ou une donnée abîmée produirait. */
const idInconnu = fc.integer({ min: 10, max: 500 })

const SANS_REFERENTIEL = new Map<number, string>()

describe('rangStatutCapex — ordre total', () => {
  it('deux statuts connus DISTINCTS n’occupent jamais le même rang', () => {
    // ORACLE (définition d'un ordre total) : le rang sert à TRIER le menu
    // déroulant « dans l'ordre LOGIQUE du cycle ». Deux statuts à rang égal
    // rendraient le tri instable — l'ordre des options changerait d'un rendu à
    // l'autre selon l'ordre d'arrivée des lignes.
    fc.assert(
      fc.property(idConnu, idConnu, (a, b) => {
        if (a === b) expect(rangStatutCapex(a)).toBe(rangStatutCapex(b))
        else expect(rangStatutCapex(a)).not.toBe(rangStatutCapex(b))
      }),
      TIRAGES,
    )
  })

  it('le rang est antisymétrique et transitif sur les statuts connus', () => {
    // ORACLE (définition d'un ordre total) : le rang est un entier, donc l'ordre
    // qu'il induit hérite de l'antisymétrie et de la transitivité de `<`. On le
    // vérifie plutôt que de le supposer : c'est la garantie que le tri du menu
    // est bien défini.
    fc.assert(
      fc.property(idConnu, idConnu, idConnu, (a, b, c) => {
        const [ra, rb, rc] = [a, b, c].map(rangStatutCapex)
        expect(ra! < rb! && rb! < ra!).toBe(false)
        if (ra! < rb! && rb! < rc!) expect(ra! < rc!).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('un statut inconnu est rejeté en FIN de tri, jamais intercalé', () => {
    // ORACLE (doc) : « statut inconnu → rejeté en fin ». Un statut que le front
    // ne connaît pas ne doit pas s'insérer au milieu du cycle et faire croire à
    // une étape intermédiaire.
    fc.assert(
      fc.property(idConnu, idInconnu, (connu, inconnu) => {
        expect(rangStatutCapex(inconnu)).toBeGreaterThan(rangStatutCapex(connu))
      }),
      TIRAGES,
    )
  })

  it('les deux issues défavorables sont classées APRÈS tout le parcours', () => {
    // ORACLE (doc) : « Ordre canonique d'AFFICHAGE : le parcours, puis Refusé,
    // puis Annulé. » Une issue défavorable ne s'intercale pas dans la
    // progression — sinon le menu déroulant proposerait « Annulé » entre deux
    // étapes d'avancement.
    for (const id of IDS_CONNUS) {
      if (ISSUES_ARRET.includes(id)) continue
      for (const issue of ISSUES_ARRET)
        expect(rangStatutCapex(issue)).toBeGreaterThan(rangStatutCapex(id))
    }
  })

  it('« Clôturé » ferme le parcours de progression', () => {
    // ORACLE (doc) : « Statut Clôturé : FIN du parcours ». Aucune étape de
    // progression ne vient après lui.
    for (const id of IDS_CONNUS) {
      if (ISSUES_ARRET.includes(id) || id === ID_CLOTURE) continue
      expect(rangStatutCapex(ID_CLOTURE)).toBeGreaterThan(rangStatutCapex(id))
    }
  })
})

const schema = (id: number, atteinte = ID_DEMANDE) =>
  schemaParcoursCapex(id, SANS_REFERENTIEL, null, atteinte)

describe('schemaParcoursCapex — schéma du parcours', () => {
  it('le chemin est toujours le même, dans l’ordre des rangs', () => {
    // ORACLE (cohérence interne) : le schéma et le menu racontent le MÊME cycle.
    fc.assert(
      fc.property(fc.oneof(idConnu, idInconnu), (statutId) => {
        const ids = schema(statutId).chemin.map((n) => n.statutId)
        expect(ids).toEqual([1, 5, 2, 6, 3, 7])
        const rangs = ids.map(rangStatutCapex)
        expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
      }),
      TIRAGES,
    )
  })

  it('le dossier est repéré par UNE seule case, sauf une fois clôturé', () => {
    fc.assert(
      fc.property(idConnu, (statutId) => {
        const { chemin, sorties } = schema(statutId)
        const actuelles = [...chemin, ...sorties].filter(
          (n) => n.etat === 'actuel',
        )
        expect(actuelles.map((n) => n.statutId)).toEqual(
          statutId === ID_CLOTURE ? [] : [statutId],
        )
      }),
      TIRAGES,
    )
  })

  it('avant la case actuelle tout est coché, après rien ne l’est', () => {
    for (const id of [1, 5, 2, 6, 3]) {
      const etats = schema(id).chemin.map((n) => n.etat)
      const i = etats.indexOf('actuel')
      expect(etats.slice(0, i).every((x) => x === 'fait')).toBe(true)
      expect(etats.slice(i + 1).every((x) => x === 'avenir')).toBe(true)
    }
  })

  it('« Clôturé » : tout le chemin est coché', () => {
    expect(schema(ID_CLOTURE).chemin.every((n) => n.etat === 'fait')).toBe(true)
  })

  it('un arrêt garde coché le chemin jusqu’à l’étape atteinte', () => {
    // Refus de la direction : Demandé et Accordé ont bien eu lieu.
    const { chemin, sorties } = schemaParcoursCapex(
      ID_REFUSE,
      SANS_REFERENTIEL,
      'direction',
      ID_ACCORDE,
    )
    expect(chemin.map((n) => n.etat)).toEqual([
      'fait',
      'fait',
      'avenir',
      'avenir',
      'avenir',
      'avenir',
    ])
    const refus = sorties.find((n) => n.statutId === ID_REFUSE)
    expect(refus?.etat).toBe('actuel')
    expect(refus?.precision).toBe('par la direction')
  })

  it('les trois sorties sont toujours montrées', () => {
    fc.assert(
      fc.property(fc.oneof(idConnu, idInconnu), (statutId) => {
        expect(schema(statutId).sorties.map((n) => n.statutId)).toEqual([
          ID_REFUSE,
          ID_REPORTE,
          ID_ANNULE,
        ])
      }),
      TIRAGES,
    )
  })

  it('un statut inconnu ne coche rien et ne jette pas', () => {
    fc.assert(
      fc.property(idInconnu, (id) => {
        const { chemin, sorties } = schema(id)
        expect([...chemin, ...sorties].every((n) => n.etat === 'avenir')).toBe(
          true,
        )
      }),
      TIRAGES,
    )
  })
})

describe('etapeAtteinteCapex', () => {
  it('lit la dernière étape du chemin dans l’historique', () => {
    expect(etapeAtteinteCapex([1, 5, 2, 6, ID_ANNULE], null)).toBe(6)
    // Relancé puis refusé : on repart de Demandé.
    expect(etapeAtteinteCapex([1, 5, ID_REFUSE, 1, ID_REFUSE], null)).toBe(1)
  })

  it('sans historique : la direction suppose « Accordé », sinon « Demandé »', () => {
    expect(etapeAtteinteCapex([], 'direction')).toBe(ID_ACCORDE)
    expect(etapeAtteinteCapex([], 'responsable')).toBe(ID_DEMANDE)
    expect(etapeAtteinteCapex([], null)).toBe(ID_DEMANDE)
  })
})

describe('nomStatutCapex — totalité', () => {
  it('le référentiel prime, puis le défaut, puis un repli lisible', () => {
    // ORACLE (doc) : « référentiel (suit un renommage), sinon défaut, sinon
    // Statut N ». Le repli existe pour qu'un badge ne disparaisse pas au premier
    // rendu tant que `statuts_capex` n'est pas chargé.
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
  })

  it('un id inconnu et sans référentiel s’affiche « Statut N »', () => {
    // ORACLE (doc) : repli final explicite, jamais « undefined » à l'écran.
    fc.assert(
      fc.property(idInconnu, (id) => {
        expect(nomStatutCapex(id, SANS_REFERENTIEL)).toBe(
          `Statut ${String(id)}`,
        )
      }),
      TIRAGES,
    )
  })

  it('le renommage du référentiel se propage jusqu’au schéma', () => {
    // ORACLE (doc) : le nom « suit un renommage ». Renommer un statut en base
    // doit changer ce que l'utilisateur lit sur la frise, sans redéploiement.
    const noms = new Map<number, string>([[1, 'Sollicité']])
    expect(nomStatutCapex(1, noms)).toBe('Sollicité')
    expect(schemaParcoursCapex(1, noms, null, 1).chemin[0]?.libelle).toBe(
      'Sollicité',
    )
  })
})

describe('statutCapexTone — totalité et sémantique', () => {
  const TONES_VALIDES = [
    'neutral',
    'success',
    'warning',
    'destructive',
    'info',
    'violet',
    'yellow',
  ]

  it('tout id rend une tonalité connue, repli « neutral »', () => {
    // ORACLE (doc de `statusToneById`) : « repli neutral ». La tonalité indexe la
    // table de classes de `StatusBadge` — une valeur hors table rendrait un badge
    // sans couleur ni contraste.
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 500 }), (id) => {
        expect(TONES_VALIDES).toContain(statutCapexTone(id))
      }),
      TIRAGES,
    )
    fc.assert(
      fc.property(idInconnu, (id) => {
        expect(statutCapexTone(id)).toBe('neutral')
      }),
      TIRAGES,
    )
  })

  it('« Refusé » est le SEUL statut en rouge', () => {
    // ORACLE (CLAUDE.md, tokens sémantiques) : `destructive` est réservé — ici à
    // l'unique issue défavorable. Un second statut en rouge brouillerait la
    // lecture du cycle.
    const rouges = IDS_CONNUS.filter(
      (id) => statutCapexTone(id) === 'destructive',
    )
    expect(rouges).toEqual([ID_REFUSE])
  })

  it('les statuts terminaux sont exactement Réalisé, Refusé, Clôturé et Annulé', () => {
    // ORACLE (doc) : « Statuts TERMINAUX d'un investissement : exclus par défaut
    // du filtre Non terminés ». Garde-fou contre un ajout de statut qui
    // déséquilibrerait le filtre par défaut des listes — un dossier ANNULÉ qui
    // resterait dans « Non terminés » reviendrait hanter la liste de travail.
    expect([...STATUTS_CAPEX_TERMINAUX].sort((a, b) => a - b)).toEqual([
      3,
      ID_REFUSE,
      ID_CLOTURE,
      ID_ANNULE,
    ])
  })
})

describe('decisionsCapex — arbre de décision (137)', () => {
  it('Demandé : MA décision — accorder, refuser ou reporter', () => {
    expect(decisionsCapex(ID_DEMANDE)).toEqual([
      { statutId: ID_ACCORDE, par: 'responsable', libelle: 'Accorder' },
      { statutId: ID_REFUSE, par: 'responsable', libelle: 'Refuser' },
      { statutId: ID_REPORTE, par: 'responsable', libelle: 'Reporter' },
    ])
  })

  it('Accordé : la décision revient à la DIRECTION', () => {
    const d = decisionsCapex(ID_ACCORDE)
    expect(d.map((x) => x.statutId)).toEqual([ID_VALIDE, ID_REFUSE, ID_REPORTE])
    expect(d.every((x) => x.par === 'direction')).toBe(true)
  })

  it('après validation, une seule étape suivante à la fois jusqu’à la clôture', () => {
    expect(decisionsCapex(ID_VALIDE).map((x) => x.statutId)).toEqual([6])
    expect(decisionsCapex(6).map((x) => x.statutId)).toEqual([3])
    expect(decisionsCapex(3).map((x) => x.statutId)).toEqual([ID_CLOTURE])
    expect(decisionsCapex(ID_CLOTURE)).toEqual([])
  })

  it('toute issue d’arrêt se relance vers « Demandé »', () => {
    for (const id of ISSUES_ARRET)
      expect(decisionsCapex(id).map((x) => x.statutId)).toEqual([ID_DEMANDE])
  })

  it('le premier choix proposé n’est jamais une issue d’arrêt', () => {
    // ORACLE (PO) : le « oui » d'abord — le bouton principal fait avancer.
    for (const id of IDS_CONNUS) {
      const [premier] = decisionsCapex(id)
      if (premier && !ISSUES_ARRET.includes(id))
        expect(ISSUES_ARRET.includes(premier.statutId)).toBe(false)
    }
  })

  it('l’historique dit qui a décidé, et distingue la demande de la relance', () => {
    const noms = new Map<number, string>()
    expect(libelleDecision(ID_DEMANDE, null, noms, true)).toBe('Demandé')
    expect(libelleDecision(ID_DEMANDE, null, noms, false)).toBe('Relancé')
    expect(libelleDecision(ID_ACCORDE, 'responsable', noms, false)).toBe(
      'Accordé par moi',
    )
    expect(libelleDecision(ID_REFUSE, 'direction', noms, false)).toBe(
      'Refusé par la direction',
    )
    expect(libelleDecision(ID_VALIDE, null, noms, false)).toBe('Validé')
  })
})
