import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  estLisible,
  messageIllisible,
  texteObligatoire,
  type SujetTexte,
} from './texte-zod'
import {
  CHAINES_BLANCHES,
  CHAINES_INVISIBLES,
  RUNS,
  arbChaineHostile,
  rejette,
} from './hostile-inputs.test'

/**
 * ORACLE : un nom, un titre, un libellé, une référence ou un constat sert à
 * RETROUVER une ligne (recherche, sélecteur de site, segment d'URL slugifié).
 * Une valeur qui ne se voit pas ne remplit aucun de ces rôles, et ni le
 * `.trim()` de JavaScript ni le `trim()` des CHECK `length(trim(nom)) > 0` de la
 * base ne la rattrapent.
 *
 * Le risque PROPRE à ce contrôle est la fausse alarme : refuser une saisie
 * légitime. D'où les deux corpus ci-dessous, tenus symétriques — ce qui doit
 * être refusé, et surtout ce qui doit RESTER accepté.
 */

/** Noms légitimes, typographie française comprise (insécables à l'intérieur). */
const NOMS_LEGITIMES = [
  'Bâtiment A',
  'Bâtiment A', // espace insécable
  'Salle 15', // espace fine insécable (avant une unité, usage FR)
  'Chaufferie n° 2',
  'A',
  '1',
  '—', // tiret cadratin seul : ça se voit
  '🔧 Atelier',
  'Zone Ω',
  '‮txt.exe', // inversion de sens, mais du texte visible derrière
]

describe('estLisible', () => {
  it('accepte tout nom comportant au moins un caractère visible', () => {
    for (const nom of NOMS_LEGITIMES) expect(estLisible(nom)).toBe(true)
  })

  it('refuse le vide, le blanc et les chaînes entièrement invisibles', () => {
    for (const s of ['', ...CHAINES_BLANCHES, ...CHAINES_INVISIBLES]) {
      expect(estLisible(s)).toBe(false)
    }
  })

  it('refuse un mélange de blancs et d’invisibles, sans autre caractère', () => {
    // Le cas réel : un copier-coller depuis un traitement de texte ou un site,
    // qui ramène un espace de largeur nulle collé à une espace ordinaire.
    for (const invisible of CHAINES_INVISIBLES) {
      for (const blanc of CHAINES_BLANCHES) {
        expect(estLisible(blanc + invisible)).toBe(false)
      }
    }
  })

  it('un caractère visible SUFFIT, où qu’il soit dans la chaîne', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CHAINES_INVISIBLES),
        fc.constantFrom(...CHAINES_INVISIBLES),
        (avant, apres) => {
          expect(estLisible(`${avant}a${apres}`)).toBe(true)
        },
      ),
      RUNS,
    )
  })
})

describe('messageIllisible', () => {
  it('EXPLIQUE au lieu de constater', () => {
    // Le champ a l'air rempli : « Le nom est obligatoire » serait aussi opaque
    // que le caractère qu'on refuse. Le message doit nommer la cause ET le geste.
    const m = messageIllisible('nom')
    expect(m).toBe(
      'Ce nom ne contient que des espaces ou des caractères invisibles. Saisissez un nom lisible.',
    )
  })

  it('s’accorde avec le sujet du champ', () => {
    expect(messageIllisible('reference')).toMatch(
      /^Cette référence .* une référence lisible\.$/,
    )
    for (const sujet of [
      'nom',
      'titre',
      'libelle',
      'constat',
      'motif',
    ] as SujetTexte[]) {
      expect(messageIllisible(sujet)).toMatch(/^Ce .* un .* lisible\.$/)
    }
  })
})

describe('texteObligatoire', () => {
  const schema = texteObligatoire('Le nom est obligatoire')

  it('distingue le VIDE (message métier) de l’INVISIBLE (message explicatif)', () => {
    const vide = schema.safeParse('')
    expect(vide.success).toBe(false)
    // Un seul message : le champ vide ne doit pas porter aussi le reproche
    // « caractères invisibles », qui n'aurait aucun sens.
    expect(vide.error?.issues).toHaveLength(1)
    expect(vide.error?.issues[0]?.message).toBe('Le nom est obligatoire')

    const invisible = schema.safeParse('​')
    expect(invisible.success).toBe(false)
    expect(invisible.error?.issues[0]?.message).toBe(messageIllisible('nom'))
  })

  it('laisse passer les noms légitimes, détourage inchangé', () => {
    for (const nom of NOMS_LEGITIMES) {
      const r = schema.safeParse(` ${nom} `)
      expect(r.success).toBe(true)
      // Le contrôle ne RÉÉCRIT pas la saisie : seuls les blancs de bord partent,
      // l'insécable intérieure reste telle que l'utilisateur l'a tapée.
      expect(r.data).toBe(nom)
    }
  })

  it('accepte exactement ce que `estLisible` accepte', () => {
    fc.assert(
      fc.property(arbChaineHostile(), (texte) => {
        expect(schema.safeParse(texte).success).toBe(estLisible(texte))
      }),
      RUNS,
    )
  })

  it('refuse ce qui n’est pas une chaîne (safeParse reste total)', () => {
    for (const v of [null, undefined, 0, {}, [], new Date()]) {
      expect(rejette(schema, v)).toBe(true)
    }
  })
})
