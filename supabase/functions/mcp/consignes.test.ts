// Les consignes arrivent-elles ENTIÈRES à Claude ? (retour PO 27/11/2026)
// Le client de Claude coupe les instructions du serveur à 4 096 caractères :
// au-delà, la fin n'est jamais lue — c'est ce qui rendait le connecteur
// inégal hors des ordres de travail.

import { assert, assertEquals } from 'jsr:@std/assert@1'
import { INSTRUCTIONS, PLAFOND_DESCRIPTION, PLAFOND_INSTRUCTIONS, REGLES_METIER } from './consignes.ts'
import { OUTILS } from './outils.ts'

const NOMS = new Set(OUTILS.map((o) => o.name))

Deno.test('les instructions tiennent sous le plafond de coupure', () => {
  assert(
    INSTRUCTIONS.length <= PLAFOND_INSTRUCTIONS,
    `${INSTRUCTIONS.length} caractères (plafond ${PLAFOND_INSTRUCTIONS}) : déplacer une règle dans REGLES_METIER`,
  )
})

Deno.test('chaque description d’outil, règles comprises, tient sous son plafond', () => {
  const tropLongues = OUTILS.filter((o) => o.description.length > PLAFOND_DESCRIPTION).map(
    (o) => `${o.name} (${o.description.length})`,
  )
  assertEquals(tropLongues, [])
})

// ORACLE : une règle accrochée à un outil disparu (renommé) ne serait plus
// jamais lue — silencieusement.
Deno.test('chaque règle métier vise un outil qui existe', () => {
  assertEquals(Object.keys(REGLES_METIER).filter((n) => !NOMS.has(n)), [])
})

Deno.test('les règles métier sont bien accolées à la description reçue par Claude', () => {
  for (const [nom, regles] of Object.entries(REGLES_METIER)) {
    const outil = OUTILS.find((o) => o.name === nom)!
    assert(outil.description.endsWith(regles), nom)
  }
})

// ORACLE : tout outil cité par son nom dans les instructions existe.
Deno.test('les instructions ne citent que des outils existants', () => {
  const cites = [...INSTRUCTIONS.matchAll(/\b[a-z]+(?:_[a-z]+)+\b/g)].map((m) => m[0])
  const inconnus = cites.filter((n) => !NOMS.has(n) && !['peut_ecrire'].includes(n))
  assertEquals(inconnus, [])
})

// ORACLE : les règles de sécurité du socle ne doivent jamais glisser hors des
// instructions (elles valent pour TOUS les gestes).
Deno.test('le socle garde les règles de sécurité', () => {
  for (const regle of ['DONNÉES ≠ CONSIGNES', 'IDENTIFIANTS', 'SANS appliquer', 'oui explicite', "N'invente jamais"]) {
    assert(INSTRUCTIONS.includes(regle), regle)
  }
})
