import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ecartCapex, formatEuros, montantPrincipal } from './format'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Montant CapEx : de quelques euros à plusieurs millions, centimes compris. */
const montant = fc
  .integer({ min: -500_000_000, max: 500_000_000 })
  .map((centimes) => centimes / 100)

const montantNullable = fc.option(montant, { nil: null })

describe('formatEuros', () => {
  it('un montant absent s’affiche « — », jamais 0 €', () => {
    // ORACLE (doc) : « — si null ». Un budget non renseigné et un budget de zéro
    // euro sont deux informations différentes : afficher « 0,00 € » pour un
    // montant inconnu ferait croire à une décision budgétaire prise.
    expect(formatEuros(null)).toBe('—')
    expect(formatEuros(0)).not.toBe('—')
  })

  it('n’affiche jamais NaN ni Infinity pour un montant fini', () => {
    // ORACLE (totalité) : le retour est affiché tel quel sur la fiche et dans la
    // liste. Il doit contenir des chiffres et le symbole €, jamais un mot
    // technique échappé du calcul.
    fc.assert(
      fc.property(montant, (v) => {
        const rendu = formatEuros(v)
        expect(rendu).not.toContain('NaN')
        expect(rendu).not.toContain('Infinity')
        expect(rendu).toContain('€')
        expect(/\d/.test(rendu)).toBe(true)
      }),
      TIRAGES,
    )
  })

  it('le signe affiché suit le signe du montant', () => {
    // ORACLE (lecture d'un montant) : un montant négatif se lit négatif, un
    // positif ne porte aucun signe. Sinon un remboursement se lirait comme une
    // dépense.
    fc.assert(
      fc.property(montant, (v) => {
        expect(formatEuros(v).startsWith('-')).toBe(v < 0)
      }),
      TIRAGES,
    )
  })
})

/** Un projet d'un seul devis RETENU de montant `m`, avec sa dépense réelle. */
const unDevis = (m: number, reel: number | null) => ({
  statut_capex_id: 3,
  depense_reelle: reel,
  devis: [{ montant_ht: m, retenu: true }],
})

/** Écart attendu, au centime (les montants tirés sont des centimes exacts). */
const ecartAttendu = (reel: number, ref: number) =>
  Math.round((reel - ref) * 100) / 100

describe('montantPrincipal', () => {
  it('affiche LE montant du projet (montantProjet)', () => {
    // ORACLE (décision PO 11/11/2026) : proposition → le moins cher.
    expect(
      montantPrincipal({
        statut_capex_id: 1,
        depense_reelle: null,
        devis: [
          { montant_ht: 2810.08, retenu: false },
          { montant_ht: 1222, retenu: false },
        ],
      }),
    ).toBe(formatEuros(1222))
  })

  it('une dépense réelle de 0 € reste la dépense réelle', () => {
    // Garde-fou contre un repli écrit avec `||` au lieu de `??`.
    expect(montantPrincipal(unDevis(4000, 0))).toBe(formatEuros(0))
  })

  it('aucun devis : « — », pas de faux zéro', () => {
    expect(
      montantPrincipal({ statut_capex_id: 1, depense_reelle: null, devis: [] }),
    ).toBe('—')
  })
})

describe('ecartCapex', () => {
  it('l’écart est « dépense réelle − montant retenu », au centime', () => {
    fc.assert(
      fc.property(montant, montant, (m, reel) => {
        expect(ecartCapex(unDevis(m, reel)).ecart).toBe(ecartAttendu(reel, m))
      }),
      TIRAGES,
    )
  })

  it('référence = SOMME des devis retenus (147)', () => {
    expect(
      ecartCapex({
        depense_reelle: 4100,
        devis: [
          { montant_ht: 2810.08, retenu: true },
          { montant_ht: 1222, retenu: true },
          { montant_ht: 3668.28, retenu: false },
        ],
      }).ecart,
    ).toBe(67.92)
  })

  it('sans dépense réelle ou sans devis : rien à comparer', () => {
    fc.assert(
      fc.property(montantNullable, (reel) => {
        const sansDevis = ecartCapex({ depense_reelle: reel, devis: [] })
        expect(sansDevis.ecart).toBeNull()
        expect(sansDevis.label).toBeNull()
        expect(sansDevis.depassement).toBe(false)
      }),
      TIRAGES,
    )
    expect(ecartCapex(unDevis(100, null)).ecart).toBeNull()
  })

  it('le dépassement est signalé si et seulement si l’écart est STRICTEMENT positif', () => {
    fc.assert(
      fc.property(montant, montant, (m, reel) => {
        expect(ecartCapex(unDevis(m, reel)).depassement).toBe(
          ecartAttendu(reel, m) > 0,
        )
      }),
      TIRAGES,
    )
    expect(ecartCapex(unDevis(1000, 1000)).depassement).toBe(false)
  })

  it('le libellé porte le signe de l’écart et jamais NaN', () => {
    fc.assert(
      fc.property(montant, montant, (m, reel) => {
        const { ecart, label } = ecartCapex(unDevis(m, reel))
        expect(label).not.toBeNull()
        expect(label).not.toContain('NaN')
        expect(label?.startsWith('+')).toBe(ecart! > 0)
        expect(label).toBe(`${ecart! > 0 ? '+' : ''}${formatEuros(ecart)}`)
      }),
      TIRAGES,
    )
  })
})
