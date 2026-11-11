import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { formatEuros, montantPrincipal } from './format'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Montant CapEx : de quelques euros à plusieurs millions, centimes compris. */
const montant = fc
  .integer({ min: -500_000_000, max: 500_000_000 })
  .map((centimes) => centimes / 100)

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

describe('montantPrincipal', () => {
  it('affiche LE montant du projet (montantProjet)', () => {
    // ORACLE (décision PO 11/11/2026) : rien de coché → le moins cher.
    expect(
      montantPrincipal({
        statut_capex_id: 1,
        devis: [
          { montant_ht: 2810.08, retenu: false },
          { montant_ht: 1222, retenu: false },
        ],
      }),
    ).toBe(formatEuros(1222))
  })

  it('réalisé : la somme des devis retenus (pas de dépense réelle à part)', () => {
    expect(
      montantPrincipal({
        statut_capex_id: 3,
        devis: [
          { montant_ht: 2810.08, retenu: true },
          { montant_ht: 1222, retenu: true },
          { montant_ht: 99, retenu: false },
        ],
      }),
    ).toBe(formatEuros(4032.08))
  })

  it('un devis à 0 € reste 0 €, pas « — »', () => {
    expect(
      montantPrincipal({
        statut_capex_id: 1,
        devis: [{ montant_ht: 0, retenu: false }],
      }),
    ).toBe(formatEuros(0))
  })

  it('aucun devis : « — », pas de faux zéro', () => {
    expect(montantPrincipal({ statut_capex_id: 1, devis: [] })).toBe('—')
  })
})
