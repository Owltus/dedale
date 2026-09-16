import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { dateAffichee } from './format'
import { STATUT_CLOTURE, STATUT_EN_COURS, STATUT_OUVERT } from './schemas'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Date nue locale (jamais `toISOString()` sur un fuseau, cf. lib/date). */
const dateNue = fc
  .date({
    min: new Date(2020, 0, 1),
    max: new Date(2030, 11, 31),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10))

/** Cycle réel de `statuts_evenements` : l'id 3 a été retiré (migration 078). */
const TOUS_STATUTS = [STATUT_OUVERT, STATUT_EN_COURS, STATUT_CLOTURE]

describe('dateAffichee (événements)', () => {
  it('« Clôturé » avec une date de clôture affiche la date de CLÔTURE', () => {
    // ORACLE (doc) : le bug corrigé était précisément qu'« un événement Clôturé
    // s'affichait avec la date à laquelle il était arrivé, ce qui se lisait
    // clôturé le [jour où c'est arrivé] ». Le badge et la date doivent dire la
    // même chose.
    fc.assert(
      fc.property(dateNue, dateNue, (date_evenement, date_cloture) => {
        expect(
          dateAffichee({
            statut_evenement_id: STATUT_CLOTURE,
            date_evenement,
            date_cloture,
          }),
        ).toBe(date_cloture)
      }),
      TIRAGES,
    )
  })

  it('« En cours » et « Ouvert » retombent sur la date de survenue', () => {
    // ORACLE (doc) : « En cours retombe sur la date de survenue, faute de mieux :
    // la base ne porte aucune date de prise en charge. » Y compris quand une
    // `date_cloture` subsiste après réouverture (transitions LIBRES, on peut
    // rouvrir un événement clôturé).
    fc.assert(
      fc.property(
        fc.constantFrom(STATUT_OUVERT, STATUT_EN_COURS),
        dateNue,
        fc.option(dateNue, { nil: null }),
        (statut_evenement_id, date_evenement, date_cloture) => {
          expect(
            dateAffichee({ statut_evenement_id, date_evenement, date_cloture }),
          ).toBe(date_evenement)
        },
      ),
      TIRAGES,
    )
  })

  it('« Clôturé » SANS date de clôture retombe sur la date de survenue', () => {
    // ORACLE (totalité) : la seule date que l'événement possède alors. Jamais
    // de champ vide ni de « Invalid Date » dans la liste.
    fc.assert(
      fc.property(dateNue, (date_evenement) => {
        expect(
          dateAffichee({
            statut_evenement_id: STATUT_CLOTURE,
            date_evenement,
            date_cloture: null,
          }),
        ).toBe(date_evenement)
      }),
      TIRAGES,
    )
  })

  it('rend TOUJOURS l’une des deux dates fournies, jamais une date inventée', () => {
    // ORACLE (totalité) : la fonction choisit entre deux dates existantes, elle
    // n'en calcule aucune — notamment pas `updated_at`, écarté par la doc comme
    // « une date technique qui ressemblerait à une information ».
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        dateNue,
        fc.option(dateNue, { nil: null }),
        (statut_evenement_id, date_evenement, date_cloture) => {
          const rendu = dateAffichee({
            statut_evenement_id,
            date_evenement,
            date_cloture,
          })
          expect([date_evenement, date_cloture]).toContain(rendu)
        },
      ),
      TIRAGES,
    )
  })

  it('la règle se vérifie sur TOUTES les combinaisons du référentiel', () => {
    // ORACLE (doc) : énumération exhaustive du cycle réel × date de clôture
    // présente ou absente. Un tableau de vérité, pas une sortie recopiée.
    for (const statut of TOUS_STATUTS) {
      for (const date_cloture of ['2026-05-20', null]) {
        const rendu = dateAffichee({
          statut_evenement_id: statut,
          date_evenement: '2026-01-15',
          date_cloture,
        })
        const attendu =
          statut === STATUT_CLOTURE && date_cloture !== null
            ? date_cloture
            : '2026-01-15'
        expect(rendu).toBe(attendu)
      }
    }
  })

  it('travaux et événements appliquent la MÊME règle (statut terminal id 4)', () => {
    // ORACLE (doc de `travaux/format.ts`) : « Même règle que sur les événements
    // et les investissements » — et les ids sont volontairement alignés
    // (migration 085 : « ids alignés sur statuts_evenements »). Garde-fou contre
    // une divergence silencieuse entre les deux sections.
    expect(STATUT_CLOTURE).toBe(4)
    expect(
      dateAffichee({
        statut_evenement_id: 4,
        date_evenement: '2026-01-15',
        date_cloture: '2026-03-02',
      }),
    ).toBe('2026-03-02')
  })
})
