import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { segOfUnique, slugify } from '@/lib/slug'
import { TIRAGES } from '@/test/harness'
import { lienLocalisations, segmentsLieu, type FreresLieu } from './lien-lieu'

/**
 * Adresse d'un lieu : `segmentsLieu` (génération) doit se RELIRE à l'identique
 * par la résolution de l'explorateur (`find` + `segOfUnique` sur les mêmes
 * frères), homonymes et noms non slugifiables compris.
 */

const FRERES: FreresLieu = {
  batiments: [
    { id: 'b-1', nom: 'Bâtiment A' },
    { id: 'b-2', nom: 'Bâtiment B' },
  ],
  niveaux: [
    { id: 'n-1', nom: 'RDC' },
    { id: 'n-2', nom: 'R+1' },
  ],
  locaux: [
    { id: 'l-1', nom: 'Hall' },
    { id: 'l-2', nom: 'Chaufferie' },
  ],
}

/** Résolution telle que l'explorateur la pratique, palier par palier. */
function resoudre(segs: string[], freres: FreresLieu) {
  const [sb, sn, sl] = segs
  const b = freres.batiments.find(
    (x) => segOfUnique(x, freres.batiments) === sb,
  )
  const n = freres.niveaux.find((x) => segOfUnique(x, freres.niveaux) === sn)
  const l = freres.locaux.find((x) => segOfUnique(x, freres.locaux) === sl)
  return { b: b?.id, n: n?.id, l: l?.id }
}

describe('segmentsLieu', () => {
  it('slug pur quand aucun frère ne collisionne', () => {
    expect(
      segmentsLieu({ id: 'l-2', niveauId: 'n-2', batimentId: 'b-1' }, FRERES),
    ).toEqual(['batiment-a', 'r-1', 'chaufferie'])
  })

  it('palier introuvable parmi ses frères → null (lieu déplacé, supprimé)', () => {
    expect(
      segmentsLieu({ id: 'l-9', niveauId: 'n-1', batimentId: 'b-1' }, FRERES),
    ).toBeNull()
    expect(
      segmentsLieu({ id: 'l-1', niveauId: 'n-9', batimentId: 'b-1' }, FRERES),
    ).toBeNull()
    expect(
      segmentsLieu({ id: 'l-1', niveauId: 'n-1', batimentId: 'b-9' }, FRERES),
    ).toBeNull()
  })

  it('homonymes : chaque lieu reçoit un segment distinct qui se relit vers LUI', () => {
    const freres: FreresLieu = {
      ...FRERES,
      locaux: [
        { id: 'aaaaaaaa-1', nom: 'Bureau' },
        { id: 'bbbbbbbb-2', nom: 'Bureau' },
        { id: 'cccccccc-3', nom: '###' },
      ],
    }
    const ids = freres.locaux.map((l) => l.id)
    const segs = ids.map((id) =>
      segmentsLieu({ id, niveauId: 'n-1', batimentId: 'b-2' }, freres),
    )
    expect(new Set(segs.map((s) => s?.[2])).size).toBe(3)
    segs.forEach((s, i) => {
      expect(resoudre(s ?? [], freres)).toEqual({
        b: 'b-2',
        n: 'n-1',
        l: ids[i],
      })
    })
  })

  it('aller-retour : génération puis résolution redonnent le même lieu (propriété)', () => {
    const noeuds = fc.uniqueArray(
      fc.record({
        id: fc.uuid(),
        nom: fc.oneof(
          fc.constantFrom('Hall', 'hall', 'Hâll', '###', 'Bureau', 'Bureau'),
          fc.string(),
        ),
      }),
      { minLength: 1, maxLength: 6, selector: (n) => n.id },
    )
    fc.assert(
      fc.property(noeuds, noeuds, noeuds, (batiments, niveaux, locaux) => {
        const freres = { batiments, niveaux, locaux }
        for (const l of locaux) {
          const segs = segmentsLieu(
            {
              id: l.id,
              niveauId: niveaux[0]!.id,
              batimentId: batiments[0]!.id,
            },
            freres,
          )
          expect(segs).not.toBeNull()
          expect(resoudre(segs ?? [], freres)).toEqual({
            b: batiments[0]!.id,
            n: niveaux[0]!.id,
            l: l.id,
          })
          // Jamais l'uuid brut dans l'URL… sauf repli d'un nom non slugifiable.
          if (slugify(l.nom) !== '') expect(segs?.[2]).not.toBe(l.id)
        }
      }),
      TIRAGES,
    )
  })
})

describe('lienLocalisations', () => {
  it('construit la cible de la route splat, racine comprise', () => {
    expect(lienLocalisations(['a', 'b', 'c'])).toEqual({
      to: '/localisations/$',
      params: { _splat: 'a/b/c' },
    })
    expect(lienLocalisations([])).toEqual({
      to: '/localisations/$',
      params: { _splat: '' },
    })
  })
})
