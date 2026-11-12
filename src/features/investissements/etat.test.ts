import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  anneeBudgetEnPreparation,
  anneesBudget,
  datesCapex,
  ID_DEMANDE,
  ID_REALISE,
  ID_REFUSE,
  ID_VALIDE,
  montantProjet,
  montantRetenu,
  nomStatutCapex,
  rangStatutCapex,
  repartitionBudget,
  schemaCapex,
  statutCapexTone,
  STATUTS_CAPEX_TERMINAUX,
  totauxAnnee,
  libelleProjet,
  reporteDe,
  stadeProjet,
  toneProjet,
} from './etat'
import { anneeDeParam } from './annee'

/** Un projet de test : statut, devis [montant, retenu]. */
const projet = (statut: number, devis: [number, boolean][] = []) => ({
  statut_capex_id: statut,
  devis: devis.map(([montant_ht, retenu]) => ({ montant_ht, retenu })),
})

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
    ).toEqual(['Proposition', 'Validé', 'Réalisé', 'Refusé'])
  })
})

describe('statutCapexTone — sémantique', () => {
  it('gris = proposition, bleu = validé, vert = réalisé, rouge = refusé', () => {
    expect(statutCapexTone(ID_DEMANDE)).toBe('neutral')
    expect(statutCapexTone(ID_VALIDE)).toBe('info')
    expect(statutCapexTone(ID_REALISE)).toBe('success')
    expect(statutCapexTone(ID_REFUSE)).toBe('destructive')
  })

  it('terminés = Réalisé et Refusé', () => {
    expect([...STATUTS_CAPEX_TERMINAUX]).toEqual([ID_REALISE, ID_REFUSE])
  })
})

describe('schemaCapex — organigramme vertical cliquable', () => {
  const cases = (id: number, a = 2026) => {
    const sc = schemaCapex(id, a, SANS_REFERENTIEL)
    return [sc.demande, sc.valide, sc.realise, sc.refuse, sc.reporte]
  }

  it('le dossier est repéré par UNE case, la sienne ; cliquable seulement pour corriger', () => {
    for (const id of IDS_CONNUS) {
      const actuelles = cases(id).filter((c) => c.etat === 'actuel')
      expect(actuelles.map((c) => c.statutId)).toEqual([id])
      const a = actuelles[0]?.action
      // Validé (146), Réalisé, Refusé : le clic rouvre leur fenêtre pour
      // corriger la date (et le reste). Seule « Proposition » est inerte.
      if (id === ID_VALIDE || id === ID_REALISE || id === ID_REFUSE)
        expect(a?.statutId).toBe(id)
      else expect(a).toBeNull()
    }
  })

  it('toute autre case est cliquable et mène à son statut', () => {
    fc.assert(
      fc.property(idConnu, annee, (id, a) => {
        for (const c of cases(id, a)) {
          if (c.etat === 'actuel') continue
          expect(c.action).not.toBeNull()
          if (c.statutId !== null) {
            expect(c.action?.statutId).toBe(c.statutId)
            expect(c.action?.annee).toBe(a)
          }
        }
      }),
      TIRAGES,
    )
  })

  it('la case de report envoie au budget suivant, en « Proposition »', () => {
    fc.assert(
      fc.property(idConnu, annee, (id, a) => {
        const r = schemaCapex(id, a, SANS_REFERENTIEL).reporte
        expect(r.libelle).toBe(`Reporter à ${String(a + 1)}`)
        expect(r.action).toEqual({
          cle: 'reporter',
          statutId: ID_DEMANDE,
          annee: a + 1,
        })
      }),
      TIRAGES,
    )
  })

  it('le clic dit ce qu’il fait : valider, rouvrir, réaliser, refuser, relancer', () => {
    const sc = (id: number) => schemaCapex(id, 2026, SANS_REFERENTIEL)
    expect(sc(ID_DEMANDE).valide.action?.cle).toBe('valider')
    expect(sc(ID_REALISE).valide.action?.cle).toBe('rouvrir')
    expect(sc(ID_VALIDE).valide.action?.cle).toBe('valider')
    expect(sc(ID_VALIDE).realise.action?.cle).toBe('realiser')
    expect(sc(ID_DEMANDE).refuse.action?.cle).toBe('refuser')
    expect(sc(ID_REFUSE).demande.action?.cle).toBe('relancer')
  })

  it('les cases passées sont cochées : Demandé dès qu’on l’a quitté, Validé une fois réalisé', () => {
    const sc = (id: number) => schemaCapex(id, 2026, SANS_REFERENTIEL)
    for (const id of [ID_VALIDE, ID_REALISE, ID_REFUSE])
      expect(sc(id).demande.etat).toBe('fait')
    expect(sc(ID_REALISE).valide.etat).toBe('fait')
    expect(sc(ID_REFUSE).valide.etat).toBe('libre')
  })

  it('les flèches colorées suivent le chemin pris', () => {
    const f = (id: number) => schemaCapex(id, 2026, SANS_REFERENTIEL).fleches
    expect(f(ID_DEMANDE)).toEqual({
      versValide: 'libre',
      versRefuse: 'libre',
      versReporte: 'libre',
      versRealise: 'libre',
    })
    expect(f(ID_VALIDE).versValide).toBe('ok')
    expect(f(ID_REALISE)).toMatchObject({ versValide: 'ok', versRealise: 'ok' })
    expect(f(ID_REFUSE)).toMatchObject({
      versRefuse: 'refus',
      versValide: 'libre',
    })
  })

  it('un statut inconnu n’allume rien et ne jette pas', () => {
    fc.assert(
      fc.property(idInconnu, (id) => {
        expect(cases(id).every((c) => c.etat === 'libre')).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('suit un renommage du référentiel', () => {
    const noms = new Map([[ID_DEMANDE, 'Sollicité']])
    expect(schemaCapex(ID_DEMANDE, 2026, noms).demande.libelle).toBe(
      'Sollicité',
    )
  })
})

describe('années de budget', () => {
  it('toujours le budget en préparation, le reste seulement s’il a des dossiers', () => {
    fc.assert(
      fc.property(fc.array(annee), annee, (annees, courante) => {
        const res = anneesBudget(annees, courante)
        expect(res).toContain(courante)
        expect(res.length).toBe(new Set([...annees, courante]).size)
        expect(new Set(res).size).toBe(res.length)
        expect(res).toEqual([...res].sort((a, b) => b - a))
        for (const a of annees) expect(res).toContain(a)
      }),
      TIRAGES,
    )
  })

  it('totaux : refus exclus du demandé, validé = validés + réalisés', () => {
    const t = totauxAnnee([
      projet(ID_DEMANDE, [
        [100, false],
        [150, false],
      ]), // le moins cher : 100
      projet(ID_VALIDE, [
        [180, true],
        [999, false],
      ]), // retenu : 180
      projet(ID_REALISE, [[300, true]]), // retenu : 300
      projet(ID_REFUSE, [[1000, false]]),
    ])
    expect(t).toEqual({ nb: 4, demande: 580, valide: 480 })
  })

  it('adresse : quatre chiffres entre 2000 et 2100, sinon rien', () => {
    expect(anneeDeParam('2027')).toBe(2027)
    expect(anneeDeParam('renovation-porte-bagages')).toBeNull()
    expect(anneeDeParam('1999')).toBeNull()
    expect(anneeDeParam('20270')).toBeNull()
  })
})

describe('datesCapex — dates du schéma', () => {
  const inv = {
    statut_capex_id: ID_VALIDE,
    annee_budget: 2026,
    date_demande: '2026-09-08',
    date_cloture: null,
    date_arret: null,
    date_validation: null as string | null,
  }
  const d = (statut: number, annee: number, jour: string) => ({
    statut_capex_id: statut,
    annee_budget: annee,
    created_at: `2026-${jour}T10:00:00+00:00`,
  })

  it('validation = la DERNIÈRE validation, même si le journal arrive en désordre', () => {
    const r = datesCapex(inv, [
      d(ID_VALIDE, 2026, '11-10'),
      d(ID_DEMANDE, 2026, '09-08'),
      d(ID_VALIDE, 2026, '10-01'),
      d(ID_DEMANDE, 2026, '10-05'),
    ])
    expect(r.demande).toBe('2026-09-08')
    expect(r.valide).toBe('2026-11-10T10:00:00+00:00')
    expect(r.realise).toBeNull()
    expect(r.refuse).toBeNull()
  })

  it('une étape qui n’est plus vraie n’a pas de date', () => {
    const r = datesCapex(
      { ...inv, statut_capex_id: ID_REFUSE, date_arret: '2026-11-04' },
      [d(ID_VALIDE, 2026, '10-01'), d(ID_REFUSE, 2026, '11-04')],
    )
    expect(r.valide).toBeNull()
    expect(r.refuse).toBe('2026-11-04')
  })

  it('validation : la date SAISIE (146) prime sur le journal', () => {
    const r = datesCapex({ ...inv, date_validation: '2026-10-15' }, [
      d(ID_VALIDE, 2026, '11-10'),
    ])
    expect(r.valide).toBe('2026-10-15')
    // Refusé depuis : la date saisie ne s'affiche plus.
    expect(
      datesCapex(
        { ...inv, statut_capex_id: ID_REFUSE, date_validation: '2026-10-15' },
        [],
      ).valide,
    ).toBeNull()
  })

  it('réalisé : la date de réalisation de la fiche', () => {
    const r = datesCapex(
      { ...inv, statut_capex_id: ID_REALISE, date_cloture: '2026-11-20' },
      [d(ID_VALIDE, 2026, '10-01')],
    )
    expect(r.realise).toBe('2026-11-20')
    expect(r.valide).toBe('2026-10-01T10:00:00+00:00')
  })

  it('report : le passage d’une année antérieure à l’année du dossier', () => {
    const r = datesCapex(
      { ...inv, statut_capex_id: ID_DEMANDE, annee_budget: 2027 },
      [d(ID_DEMANDE, 2026, '09-08'), d(ID_DEMANDE, 2027, '11-10')],
    )
    expect(r.reporte).toEqual({
      date: '2026-11-10T10:00:00+00:00',
      depuis: 2026,
    })
    // Sans changement d'année : pas de report.
    expect(datesCapex(inv, [d(ID_DEMANDE, 2026, '09-08')]).reporte).toBeNull()
    // Ramené en arrière (correction d'année) : ce n'est pas un report.
    expect(
      datesCapex(inv, [
        d(ID_DEMANDE, 2027, '09-08'),
        d(ID_DEMANDE, 2026, '10-01'),
      ]).reporte,
    ).toBeNull()
  })
})

describe('budget en préparation', () => {
  it('en 2026, on prépare le budget 2027 — même le 31 décembre', () => {
    expect(anneeBudgetEnPreparation(new Date(2026, 0, 1))).toBe(2027)
    expect(anneeBudgetEnPreparation(new Date(2026, 11, 31))).toBe(2027)
  })
})

describe('montantProjet — LE montant d’un projet (147)', () => {
  // ORACLE : décisions PO du 11/11/2026 — la sélection (devis retenus,
  // même avant validation, réalisé compris), sinon le moins cher.
  it('sans devis : aucun montant', () => {
    expect(montantProjet(projet(ID_DEMANDE))).toBeNull()
    expect(montantProjet(projet(ID_VALIDE))).toBeNull()
  })

  it('proposition : le moins cher, puis la sélection dès qu’un devis est coché', () => {
    expect(
      montantProjet(
        projet(ID_DEMANDE, [
          [2810.08, false],
          [1222, false],
        ]),
      ),
    ).toBe(1222)
    expect(
      montantProjet(
        projet(ID_DEMANDE, [
          [2810.08, true],
          [1222, false],
        ]),
      ),
    ).toBe(2810.08)
  })

  it('refusé : la sélection aussi', () => {
    expect(
      montantProjet(
        projet(ID_REFUSE, [
          [500, true],
          [300, false],
        ]),
      ),
    ).toBe(500)
  })

  it('validé : la somme des retenus, au centime', () => {
    expect(
      montantProjet(
        projet(ID_VALIDE, [
          [2810.08, true],
          [1222, true],
          [3668.28, false],
        ]),
      ),
    ).toBe(4032.08)
    expect(
      montantProjet(
        projet(ID_VALIDE, [
          [0.1, true],
          [0.2, true],
        ]),
      ),
    ).toBe(0.3)
  })

  it('validé sans aucun retenu : retombe sur le moins cher', () => {
    expect(
      montantProjet(
        projet(ID_VALIDE, [
          [400, false],
          [300, false],
        ]),
      ),
    ).toBe(300)
  })

  it('réalisé : la somme des devis retenus (pas de dépense réelle à part)', () => {
    expect(
      montantProjet(
        projet(ID_REALISE, [
          [300, true],
          [50, false],
        ]),
      ),
    ).toBe(300)
  })

  it('rien de coché : toujours le devis le moins cher', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(ID_DEMANDE, ID_VALIDE, ID_REFUSE),
        fc.array(fc.integer({ min: 0, max: 1e6 }), { minLength: 1 }),
        (statut, montants) => {
          const devis = montants.map((x): [number, boolean] => [x, false])
          const m = montantProjet(projet(statut, devis))
          expect(m).toBe(Math.min(...devis.map(([x]) => x)))
        },
      ),
      TIRAGES,
    )
  })

  it('montantRetenu : retenus additionnés, sinon le moins cher', () => {
    expect(
      montantRetenu(
        projet(ID_DEMANDE, [
          [10, true],
          [20, true],
          [5, false],
        ]),
      ),
    ).toBe(30)
    expect(
      montantRetenu(
        projet(ID_DEMANDE, [
          [10, false],
          [5, false],
        ]),
      ),
    ).toBe(5)
    expect(montantRetenu(projet(ID_DEMANDE))).toBeNull()
  })
})

describe('repartitionBudget — barre d’un budget', () => {
  it('ordre du parcours, montant du projet, statuts vides omis', () => {
    expect(
      repartitionBudget([
        projet(ID_REFUSE, [[1000, false]]),
        projet(ID_DEMANDE, [
          [100, false],
          [400, false],
        ]),
        projet(ID_VALIDE, [
          [180, true],
          [200, false],
        ]),
        projet(ID_VALIDE, [[50, true]]),
        projet(ID_DEMANDE),
      ]),
    ).toEqual([
      { statutId: ID_VALIDE, montant: 230, nb: 2 },
      { statutId: ID_DEMANDE, montant: 100, nb: 2 },
      { statutId: ID_REFUSE, montant: 1000, nb: 1 },
    ])
  })

  it('réalisé : la somme des devis retenus', () => {
    expect(repartitionBudget([projet(ID_REALISE, [[300, true]])])).toEqual([
      { statutId: ID_REALISE, montant: 300, nb: 1 },
    ])
  })

  it('la somme des projets comptés = le nombre de projets connus', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            statut_capex_id: fc.constantFrom(...IDS_CONNUS),
            devis: fc.array(
              fc.record({
                montant_ht: fc.integer({ min: 0, max: 1e6 }),
                retenu: fc.boolean(),
              }),
            ),
          }),
        ),
        (invs) => {
          const parts = repartitionBudget(invs)
          expect(parts.reduce((s, p) => s + p.nb, 0)).toBe(invs.length)
          expect(parts.every((p) => p.montant >= 0)).toBe(true)
        },
      ),
      TIRAGES,
    )
  })
})

describe('stade et couleur d’un projet (demande PO du 12/11/2026)', () => {
  it('sans devis = gris, avec des devis (même non choisis) = violet', () => {
    expect(stadeProjet(projet(ID_DEMANDE))).toBe('projet')
    expect(toneProjet(projet(ID_DEMANDE))).toBe('neutral')
    expect(stadeProjet(projet(ID_DEMANDE, [[100, false]]))).toBe('devis')
    expect(toneProjet(projet(ID_DEMANDE, [[100, false]]))).toBe('violet')
    expect(toneProjet(projet(ID_DEMANDE, [[100, true]]))).toBe('violet')
  })

  it('le statut l’emporte sur les devis une fois décidé', () => {
    expect(toneProjet(projet(ID_VALIDE, [[100, true]]))).toBe('info')
    expect(toneProjet(projet(ID_REALISE, [[100, true]]))).toBe('success')
    expect(toneProjet(projet(ID_REFUSE))).toBe('destructive')
  })

  it('libellé « Devis reçus » seulement au stade devis', () => {
    const noms = new Map<number, string>()
    expect(libelleProjet(projet(ID_DEMANDE), noms)).toBe('Proposition')
    expect(libelleProjet(projet(ID_DEMANDE, [[1, false]]), noms)).toBe(
      'Devis reçus',
    )
    expect(libelleProjet(projet(ID_VALIDE, [[1, true]]), noms)).toBe('Validé')
  })
})

describe('reporteDe — projet reporté', () => {
  it('null sans historique ou sans année antérieure', () => {
    expect(reporteDe({ annee_budget: 2027 })).toBeNull()
    expect(
      reporteDe({
        annee_budget: 2027,
        decisions: [{ annee_budget: 2027 }, { annee_budget: null }],
      }),
    ).toBeNull()
  })

  it('la dernière année antérieure de son historique', () => {
    expect(
      reporteDe({
        annee_budget: 2028,
        decisions: [
          { annee_budget: 2026 },
          { annee_budget: 2027 },
          { annee_budget: 2028 },
        ],
      }),
    ).toBe(2027)
  })
})
