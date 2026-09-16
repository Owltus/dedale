import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { construireEtapes, type EtapeStatut } from './status-steps'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Libellé de test : injectif (un id ↔ un libellé) pour vérifier l'appariement. */
const nom = (id: number) => `Statut ${String(id)}`

/** Parcours d'affichage réaliste : des ids DISTINCTS et NON monotones. */
const parcoursArb = fc.uniqueArray(fc.integer({ min: 1, max: 30 }), {
  minLength: 1,
  maxLength: 8,
})

/** Frise construite sur un statut appartenant au parcours (cas nominal). */
const friseArb = parcoursArb.chain((parcours) =>
  fc.record({
    parcours: fc.constant(parcours),
    idx: fc.integer({ min: 0, max: parcours.length - 1 }),
  }),
)

function etapes(parcours: readonly number[], statutId: number): EtapeStatut[] {
  const res = construireEtapes({
    parcours,
    statutId,
    nom,
    actionable: (_id, i, idx) => i !== idx,
  })
  expect(res).not.toBeNull()
  return res ?? []
}

describe('construireEtapes — conservation', () => {
  it('rend autant d’étapes que le parcours en compte, dans le même ordre', () => {
    // ORACLE (doc) : la frise est la lecture visuelle du « parcours d'AFFICHAGE ».
    // Elle ne peut ni perdre une étape (jalon invisible pour l'utilisateur) ni en
    // inventer, ni réordonner le cycle.
    fc.assert(
      fc.property(friseArb, ({ parcours, idx }) => {
        const res = etapes(parcours, parcours[idx]!)
        expect(res.map((e) => e.statutId)).toEqual([...parcours])
        expect(res.map((e) => e.label)).toEqual(parcours.map(nom))
      }),
      TIRAGES,
    )
  })

  it('tout ce qui précède le statut courant est FRANCHI, tout ce qui suit est À VENIR', () => {
    // ORACLE (doc) : « parcours positionnel → états done/current/upcoming ». La
    // frise raconte une progression : rien d'« à venir » avant le point où l'on
    // est, rien de « franchi » après. L'état se calcule par POSITION, jamais par
    // valeur d'id (les ids ne sont volontairement pas monotones).
    fc.assert(
      fc.property(friseArb, ({ parcours, idx }) => {
        const res = etapes(parcours, parcours[idx]!)
        res.forEach((e, i) => {
          if (i < idx) expect(e.state).toBe('done')
          if (i > idx) expect(e.state).toBe('upcoming')
        })
      }),
      TIRAGES,
    )
  })

  it('exactement UNE étape courante, sauf au bout du parcours où tout est franchi', () => {
    // ORACLE (doc) : « le dernier statut atteint est done, pas current → l'entité
    // se lit comme accomplie ». Donc : une seule étape `current` tant que le
    // parcours n'est pas terminé, zéro une fois au bout — et jamais deux, ce qui
    // afficherait deux pastilles « en cours » simultanées.
    fc.assert(
      fc.property(friseArb, ({ parcours, idx }) => {
        const res = etapes(parcours, parcours[idx]!)
        const courantes = res.filter((e) => e.state === 'current')
        const auBout = idx === parcours.length - 1
        expect(courantes).toHaveLength(auBout ? 0 : 1)
        if (!auBout) expect(courantes[0]?.statutId).toBe(parcours[idx])
        else expect(res.every((e) => e.state === 'done')).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('aucune étape « refusée » n’apparaît dans un parcours nominal', () => {
    // ORACLE (doc) : l'état `rejected` est réservé à « l'issue défavorable
    // terminale HORS parcours ». Une croix rouge au milieu d'une progression
    // normale serait un contresens visuel.
    fc.assert(
      fc.property(friseArb, ({ parcours, idx }) => {
        const res = etapes(parcours, parcours[idx]!)
        expect(res.some((e) => e.state === 'rejected')).toBe(false)
      }),
      TIRAGES,
    )
  })

  it('l’actionnabilité est déléguée telle quelle, avec les bonnes positions', () => {
    // ORACLE (doc) : `actionable` « reçoit l'id du statut, sa position et la
    // position du statut courant ». La frise ne décide RIEN de l'actionnabilité
    // (elle appartient à chaque feature) : elle transmet des positions justes.
    fc.assert(
      fc.property(friseArb, ({ parcours, idx }) => {
        const vus: { id: number; i: number; idx: number }[] = []
        const res = construireEtapes({
          parcours,
          statutId: parcours[idx]!,
          nom,
          actionable: (id, i, current) => {
            vus.push({ id, i, idx: current })
            return i % 2 === 0
          },
        })
        expect(vus).toEqual(parcours.map((id, i) => ({ id, i, idx })))
        expect(res?.map((e) => e.actionable)).toEqual(
          parcours.map((_id, i) => i % 2 === 0),
        )
      }),
      TIRAGES,
    )
  })
})

describe('construireEtapes — totalité', () => {
  it('un statut hors parcours ne produit AUCUNE frise', () => {
    // ORACLE (doc) : « Renvoie null si le statut n'appartient ni au parcours ni
    // au refus → l'appelant retombe sur un badge. » Mieux vaut pas de frise
    // qu'une frise où aucune étape n'est courante (elle se lirait « pas commencé »).
    fc.assert(
      fc.property(
        parcoursArb,
        fc.integer({ min: 100, max: 200 }),
        (parcours, inconnu) => {
          expect(
            construireEtapes({
              parcours,
              statutId: inconnu,
              nom,
              actionable: () => true,
            }),
          ).toBeNull()
        },
      ),
      TIRAGES,
    )
  })

  it('un parcours VIDE ne produit aucune frise, refus compris', () => {
    // ORACLE (totalité) : sans étape à afficher, il n'y a pas de frise possible.
    // Le cas du refus doit lui aussi retomber sur `null` (pas de départ connu)
    // au lieu de lire `parcours[0]` sur un tableau vide.
    expect(
      construireEtapes({
        parcours: [],
        statutId: 1,
        nom,
        actionable: () => true,
      }),
    ).toBeNull()
    expect(
      construireEtapes({
        parcours: [],
        statutId: 9,
        nom,
        actionable: () => true,
        rejected: { id: 9 },
      }),
    ).toBeNull()
  })

  it('un parcours à UNE seule étape est franchi dès qu’on y est', () => {
    // ORACLE (doc) : l'unique étape est aussi la dernière → `done`, pas
    // `current`. Cas dégénéré du même invariant.
    const res = etapes([7], 7)
    expect(res).toHaveLength(1)
    expect(res[0]?.state).toBe('done')
  })

  it('un parcours à ids dupliqués ne jette pas et garde sa longueur', () => {
    // ORACLE (totalité) : un référentiel mal configuré ne doit pas faire tomber
    // l'écran. L'état reste positionnel (`indexOf` = première occurrence), donc
    // la frise reste cohérente en longueur et en libellés.
    const res = etapes([1, 2, 1], 1)
    expect(res.map((e) => e.state)).toEqual(['current', 'upcoming', 'upcoming'])
  })
})

describe('construireEtapes — issue défavorable (rejected)', () => {
  it('le refus rend une frise minimale « départ franchi → refusé », en lecture seule', () => {
    // ORACLE (doc) : « Si le statut courant vaut rejected.id, on renvoie une
    // frise MINIMALE en lecture seule (départ franchi → issue refusée),
    // l'historique du statut précédent étant inconnu. » Terminal → rien
    // d'actionnable : on ne clique pas pour « repasser » par une étape.
    fc.assert(
      fc.property(
        parcoursArb,
        fc.integer({ min: 100, max: 200 }),
        (parcours, refuseId) => {
          const res = construireEtapes({
            parcours,
            statutId: refuseId,
            nom,
            actionable: () => true,
            rejected: { id: refuseId },
          })
          expect(res).toHaveLength(2)
          expect(res?.map((e) => e.state)).toEqual(['done', 'rejected'])
          expect(res?.map((e) => e.statutId)).toEqual([parcours[0], refuseId])
          expect(res?.every((e) => !e.actionable)).toBe(true)
        },
      ),
      TIRAGES,
    )
  })

  it('un départ explicite prime sur la première étape du parcours', () => {
    // ORACLE (doc) : « departId = première étape affichée (défaut : parcours[0]) ».
    // CapEx s'en sert pour afficher « Demandé » comme départ du refus.
    const res = construireEtapes({
      parcours: [1, 5, 2],
      statutId: 4,
      nom,
      actionable: () => true,
      rejected: { id: 4, departId: 5 },
    })
    expect(res?.map((e) => e.statutId)).toEqual([5, 4])
  })

  it('tant que le statut n’est PAS le refus, la frise reste nominale', () => {
    // ORACLE (doc) : la branche de refus se déclenche sur l'égalité au statut
    // courant seulement. Déclarer un `rejected` ne doit pas amputer la frise
    // d'une entité qui progresse normalement.
    fc.assert(
      fc.property(friseArb, ({ parcours, idx }) => {
        const res = construireEtapes({
          parcours,
          statutId: parcours[idx]!,
          nom,
          actionable: () => true,
          rejected: { id: 999 },
        })
        expect(res).toHaveLength(parcours.length)
      }),
      TIRAGES,
    )
  })
})
