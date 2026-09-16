import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { dateAffichee } from './format'
import { STATUT_EN_COURS, STATUT_OUVERT, STATUT_TERMINE } from './schemas'

const TIRAGES = { numRuns: 1000, seed: 42 } as const

/** Date nue locale (jamais `toISOString()`, cf. lib/date). */
const dateNue = fc
  .date({
    min: new Date(2020, 0, 1),
    max: new Date(2030, 11, 31),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10))

/** Tous les statuts du référentiel `statuts_travaux` (l'id 3 est vacant). */
const TOUS_STATUTS = [STATUT_OUVERT, STATUT_EN_COURS, STATUT_TERMINE]

describe('dateAffichee (travaux)', () => {
  it('« Terminé » avec une date de fin affiche la date de FIN', () => {
    // ORACLE (doc) : « la date affichée correspond au badge affiché juste
    // au-dessus » — un travaux terminé se lit « Terminé le [jour de fin] ».
    fc.assert(
      fc.property(dateNue, dateNue, (date_demande, date_fin) => {
        expect(
          dateAffichee({
            statut_travaux_id: STATUT_TERMINE,
            date_demande,
            date_fin,
          }),
        ).toBe(date_fin)
      }),
      TIRAGES,
    )
  })

  it('tout statut NON terminé affiche la date de demande, même si une date de fin traîne', () => {
    // ORACLE (doc) : seul « Terminé » a une date de fin ; ailleurs la date du
    // badge est celle de la demande. Une `date_fin` résiduelle (réouverture mal
    // nettoyée) ne doit pas faire afficher une date de fin sur un travaux
    // rouvert — le badge dirait « En cours » à côté d'une date de clôture.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }).filter((id) => id !== STATUT_TERMINE),
        dateNue,
        fc.option(dateNue, { nil: null }),
        (statut_travaux_id, date_demande, date_fin) => {
          expect(
            dateAffichee({ statut_travaux_id, date_demande, date_fin }),
          ).toBe(date_demande)
        },
      ),
      TIRAGES,
    )
  })

  it('« Terminé » SANS date de fin retombe sur la date de demande', () => {
    // ORACLE (doc) : « Annulé est terminal lui aussi, mais n'en reçoit pas — un
    // travaux annulé affiche donc sa date de création, ce qui est la seule date
    // qu'il possède. » Même repli si le trigger n'a pas posé de `date_fin` :
    // jamais de trou, jamais de « Invalid Date ».
    fc.assert(
      fc.property(dateNue, (date_demande) => {
        expect(
          dateAffichee({
            statut_travaux_id: STATUT_TERMINE,
            date_demande,
            date_fin: null,
          }),
        ).toBe(date_demande)
      }),
      TIRAGES,
    )
  })

  it('rend TOUJOURS l’une des deux dates fournies, jamais une date inventée', () => {
    // ORACLE (totalité) : la fonction choisit, elle ne fabrique pas. Sur toutes
    // les combinaisons (statut × date de fin présente ou non), le résultat doit
    // être exactement `date_demande` ou `date_fin`.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        dateNue,
        fc.option(dateNue, { nil: null }),
        (statut_travaux_id, date_demande, date_fin) => {
          const rendu = dateAffichee({
            statut_travaux_id,
            date_demande,
            date_fin,
          })
          expect([date_demande, date_fin]).toContain(rendu)
        },
      ),
      TIRAGES,
    )
  })

  it('la règle se vérifie sur TOUTES les combinaisons du référentiel', () => {
    // ORACLE (doc) : énumération exhaustive du cycle réel (statuts_travaux :
    // 1 Ouvert, 2 En cours, 4 Terminé) × date de fin présente ou absente.
    for (const statut of TOUS_STATUTS) {
      for (const date_fin of ['2026-05-20', null]) {
        const rendu = dateAffichee({
          statut_travaux_id: statut,
          date_demande: '2026-01-15',
          date_fin,
        })
        const attendu =
          statut === STATUT_TERMINE && date_fin !== null
            ? date_fin
            : '2026-01-15'
        expect(rendu).toBe(attendu)
      }
    }
  })
})
