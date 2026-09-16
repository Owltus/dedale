import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { ecartCapex, formatEuros, montantPrincipal } from './format'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Montant CapEx : de quelques euros à plusieurs millions, centimes compris. */
const montant = fc
  .integer({ min: -500_000_000, max: 500_000_000 })
  .map((centimes) => centimes / 100)

const montantNullable = fc.option(montant, { nil: null })

/**
 * Oracle du montant retenu, écrit en toutes lettres d'après la doc — et non
 * sous forme de repli en chaîne, pour ne pas recopier l'implémentation.
 */
function montantAttendu(inv: {
  montant_demande: number | null
  montant_prevu: number | null
  depense_reelle: number | null
}): number | null {
  if (inv.depense_reelle !== null) return inv.depense_reelle
  if (inv.montant_prevu !== null) return inv.montant_prevu
  return inv.montant_demande
}

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
  it('retient la dépense réelle, sinon le prévu, sinon le demandé', () => {
    // ORACLE (doc) : « du plus engageant au moins engageant : la dépense réelle
    // s'il y en a une, sinon le budget prévu, sinon le montant demandé ».
    // Oracle recalculé indépendamment de l'implémentation.
    fc.assert(
      fc.property(
        montantNullable,
        montantNullable,
        montantNullable,
        (montant_demande, montant_prevu, depense_reelle) => {
          const attendu = montantAttendu({
            montant_demande,
            montant_prevu,
            depense_reelle,
          })
          expect(
            montantPrincipal({
              montant_demande,
              montant_prevu,
              depense_reelle,
            }),
          ).toBe(formatEuros(attendu))
        },
      ),
      TIRAGES,
    )
  })

  it('une dépense réelle de 0 € reste la dépense réelle', () => {
    // ORACLE (doc : repli sur l'ABSENCE de montant, pas sur sa nullité) : un
    // investissement engagé dont rien n'a encore été dépensé vaut 0 €, et non le
    // budget prévu. Garde-fou contre un repli écrit avec `||` au lieu de `??`.
    expect(
      montantPrincipal({
        montant_demande: 5000,
        montant_prevu: 4000,
        depense_reelle: 0,
      }),
    ).toBe(formatEuros(0))
  })

  it('aucun montant renseigné s’affiche « — »', () => {
    // ORACLE (doc de `formatEuros`) : sans aucun montant, il n'y a rien à
    // afficher — pas de faux zéro.
    expect(
      montantPrincipal({
        montant_demande: null,
        montant_prevu: null,
        depense_reelle: null,
      }),
    ).toBe('—')
  })
})

describe('ecartCapex', () => {
  it('l’écart est exactement « dépense réelle − budget prévu »', () => {
    // ORACLE (doc du champ) : « réel − prévu ». Oracle arithmétique écrit ici,
    // avec le même parenthésage, pour que l'égalité ne dépende pas des arrondis.
    fc.assert(
      fc.property(montant, montant, (montant_prevu, depense_reelle) => {
        expect(ecartCapex({ montant_prevu, depense_reelle }).ecart).toBe(
          depense_reelle - montant_prevu,
        )
      }),
      TIRAGES,
    )
  })

  it('un écart manquant d’un côté rend tout le bloc non calculable', () => {
    // ORACLE (doc) : « ou null si l'un des deux montants manque ». Comparer un
    // budget à une dépense inconnue n'a pas de sens : ni écart, ni libellé, ni
    // alerte de dépassement.
    fc.assert(
      fc.property(montantNullable, montantNullable, (prevu, reelle) => {
        const res = ecartCapex({
          montant_prevu: prevu,
          depense_reelle: reelle,
        })
        if (prevu !== null && reelle !== null) return
        expect(res.ecart).toBeNull()
        expect(res.label).toBeNull()
        expect(res.depassement).toBe(false)
      }),
      TIRAGES,
    )
  })

  it('le dépassement est signalé si et seulement si l’écart est STRICTEMENT positif', () => {
    // ORACLE (doc) : « Vrai en cas de DÉPASSEMENT (réel > prévu) […] sous le
    // budget ou à l'équilibre reste neutre ». Une dépense pile au budget n'est
    // pas un dépassement — elle ne doit pas déclencher d'alerte.
    fc.assert(
      fc.property(montant, montant, (montant_prevu, depense_reelle) => {
        expect(ecartCapex({ montant_prevu, depense_reelle }).depassement).toBe(
          depense_reelle > montant_prevu,
        )
      }),
      TIRAGES,
    )
    expect(
      ecartCapex({ montant_prevu: 1000, depense_reelle: 1000 }).depassement,
    ).toBe(false)
  })

  it('le libellé porte le signe de l’écart et jamais NaN', () => {
    // ORACLE (doc) : « Libellé signé (+1 200,00 €) ». Un dépassement s'annonce
    // avec un « + » explicite ; une économie garde le « - » du formatage ; un
    // écart nul n'affiche aucun signe.
    fc.assert(
      fc.property(montant, montant, (montant_prevu, depense_reelle) => {
        const { ecart, label } = ecartCapex({ montant_prevu, depense_reelle })
        expect(label).not.toBeNull()
        expect(label).not.toContain('NaN')
        expect(label?.startsWith('+')).toBe(ecart! > 0)
        expect(label?.startsWith('-')).toBe(ecart! < 0)
      }),
      TIRAGES,
    )
  })

  it('le libellé affiche la valeur absolue de l’écart, au centime près', () => {
    // ORACLE (cohérence entre le nombre et son libellé) : le texte affiché doit
    // représenter LE même écart que le champ `ecart`, signe compris — sinon la
    // fiche montrerait un montant qui ne correspond à aucun calcul.
    fc.assert(
      fc.property(montant, montant, (montant_prevu, depense_reelle) => {
        const { ecart, label } = ecartCapex({ montant_prevu, depense_reelle })
        expect(label).toBe(`${ecart! > 0 ? '+' : ''}${formatEuros(ecart)}`)
      }),
      TIRAGES,
    )
  })
})
