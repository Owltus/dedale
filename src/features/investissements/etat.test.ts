import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  etapesInvestissement,
  ID_ANNULE,
  ID_CLOTURE,
  ID_REFUSE,
  nomStatutCapex,
  rangStatutCapex,
  statutCapexTone,
  STATUTS_CAPEX_TERMINAUX,
} from './etat'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Ids du seed `statuts_capex` (1-7), refus compris. */
// 8 = « Annulé », ajouté par la migration 121.
const IDS_CONNUS = [1, 2, 3, 4, 5, 6, 7, 8] as const
const idConnu = fc.constantFrom(...IDS_CONNUS)
/** Ids hors seed : ce qu'une migration future ou une donnée abîmée produirait. */
const idInconnu = fc.integer({ min: 9, max: 500 })

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
      if (id === ID_REFUSE || id === ID_ANNULE) continue
      expect(rangStatutCapex(ID_REFUSE)).toBeGreaterThan(rangStatutCapex(id))
      expect(rangStatutCapex(ID_ANNULE)).toBeGreaterThan(rangStatutCapex(id))
    }
  })

  it('« Clôturé » ferme le parcours de progression', () => {
    // ORACLE (doc) : « Statut Clôturé : FIN du parcours ». Aucune étape de
    // progression ne vient après lui.
    for (const id of IDS_CONNUS) {
      if (id === ID_REFUSE || id === ID_ANNULE || id === ID_CLOTURE) continue
      expect(rangStatutCapex(ID_CLOTURE)).toBeGreaterThan(rangStatutCapex(id))
    }
  })
})

describe('etapesInvestissement', () => {
  it('la frise suit l’ordre des rangs, strictement croissant', () => {
    // ORACLE (cohérence interne) : la frise et le menu déroulant racontent le
    // MÊME cycle. Si les étapes de la frise n'étaient pas rangées comme le tri,
    // l'utilisateur lirait deux ordres différents pour un même investissement.
    fc.assert(
      fc.property(idConnu, (statutId) => {
        const res = etapesInvestissement(statutId, SANS_REFERENTIEL)
        if (statutId === ID_REFUSE) return
        const rangs = (res ?? []).map((e) => rangStatutCapex(e.statutId))
        expect(rangs).toEqual([...rangs].sort((a, b) => a - b))
        expect(new Set(rangs).size).toBe(rangs.length)
      }),
      TIRAGES,
    )
  })

  it('le parcours affiché est toujours le même — seul l’avancement change', () => {
    // ORACLE (doc de `construireEtapes`) : le parcours est fixe, l'état des
    // étapes est positionnel. Deux investissements à des stades différents
    // montrent la même frise, pas la même progression.
    fc.assert(
      fc.property(idConnu, idConnu, (a, b) => {
        // Les deux issues défavorables sont hors parcours : elles rendent une
        // frise MINIMALE, pas le parcours complet. On les écarte ici, chacune
        // ayant son propre test juste en dessous.
        const horsParcours = (id: number) =>
          id === ID_REFUSE || id === ID_ANNULE
        if (horsParcours(a) || horsParcours(b)) return
        expect(
          etapesInvestissement(a, SANS_REFERENTIEL)?.map((e) => e.statutId),
        ).toEqual(
          etapesInvestissement(b, SANS_REFERENTIEL)?.map((e) => e.statutId),
        )
      }),
      TIRAGES,
    )
  })

  it('« Annulé » est traité à part : frise minimale « Demandé → Annulé »', () => {
    // ORACLE (doc) : même traitement que le refus — une issue défavorable n'est
    // pas une étape d'avancement. Sans ce test, « Annulé » se serait affiché
    // comme un parcours complet figé à « Demandé », ce qui laisserait croire que
    // le dossier est encore en cours.
    const res = etapesInvestissement(ID_ANNULE, SANS_REFERENTIEL)
    expect(res?.map((e) => e.statutId)).toEqual([1, ID_ANNULE])
    expect(res?.map((e) => e.state)).toEqual(['done', 'rejected'])
    // Terminal → rien n'est actionnable depuis la frise.
    expect(res?.every((e) => !e.actionable)).toBe(true)
  })

  it('« Refusé » est traité à part : frise minimale « Demandé → Refusé »', () => {
    // ORACLE (doc) : « Refusé : frise minimale (départ Demandé franchi puis
    // issue refusée), en lecture seule. » C'est une issue, pas une étape du
    // parcours — elle ne s'affiche donc pas comme un avancement.
    const res = etapesInvestissement(ID_REFUSE, SANS_REFERENTIEL)
    expect(res?.map((e) => e.statutId)).toEqual([1, ID_REFUSE])
    expect(res?.map((e) => e.state)).toEqual(['done', 'rejected'])
    expect(res?.every((e) => !e.actionable)).toBe(true)
  })

  it('« Clôturé » est terminal : frise entièrement franchie, sans étape courante', () => {
    // ORACLE (doc de `construireEtapes`) : « le dernier statut atteint est done,
    // pas current → l'entité se lit comme accomplie ». Un dossier clos ne doit
    // pas afficher une étape « en cours ».
    const res = etapesInvestissement(ID_CLOTURE, SANS_REFERENTIEL)
    expect(res?.every((e) => e.state === 'done')).toBe(true)
    expect(res?.some((e) => e.state === 'current')).toBe(false)
  })

  it('un statut de PROGRESSION a bien une étape courante, et une seule', () => {
    // ORACLE (doc) : distinction entre statuts de progression et statuts
    // terminaux. « Réalisé » (3) reste une étape du parcours — « les dépenses
    // peuvent encore bouger » — donc il porte l'étape courante, contrairement à
    // Clôturé et Refusé.
    for (const id of [1, 5, 2, 6, 3]) {
      const res = etapesInvestissement(id, SANS_REFERENTIEL)
      const courantes = (res ?? []).filter((e) => e.state === 'current')
      expect(courantes.map((e) => e.statutId)).toEqual([id])
    }
  })

  it('toutes les étapes sont cliquables sauf celle où l’on est', () => {
    // ORACLE (doc) : « Statut LIBRE (aucune machine à états) → toute étape du
    // parcours est actionnable (clic = on positionne ce statut), sauf l'étape
    // courante. » Un clic sur le statut déjà en place n'aurait aucun effet.
    fc.assert(
      fc.property(fc.constantFrom(1, 5, 2, 6, 3, 7), (statutId) => {
        for (const e of etapesInvestissement(statutId, SANS_REFERENTIEL) ??
          []) {
          expect(e.actionable).toBe(e.statutId !== statutId)
        }
      }),
      TIRAGES,
    )
  })

  it('un statut inconnu ne produit aucune frise, et ne jette pas', () => {
    // ORACLE (doc) : « Renvoie null si le statut n'appartient ni au parcours ni
    // au refus → la frise n'est alors pas affichée. » Totalité : la fiche doit
    // s'ouvrir même sur une donnée inattendue.
    fc.assert(
      fc.property(idInconnu, (id) => {
        expect(etapesInvestissement(id, SANS_REFERENTIEL)).toBeNull()
      }),
      TIRAGES,
    )
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

  it('le renommage du référentiel se propage jusqu’aux libellés de la frise', () => {
    // ORACLE (doc) : le nom « suit un renommage ». Renommer un statut en base
    // doit changer ce que l'utilisateur lit sur la frise, sans redéploiement.
    const noms = new Map<number, string>([[1, 'Sollicité']])
    expect(nomStatutCapex(1, noms)).toBe('Sollicité')
    expect(etapesInvestissement(1, noms)?.[0]?.label).toBe('Sollicité')
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
