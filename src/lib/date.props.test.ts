import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ajouterJours,
  ajouterSemaines,
  formatDate,
  formatDateAvecSemaineIso,
  formatDateLong,
  isoLocale,
  lundiDeLaSemaine,
  minuit,
  numeroSemaineIso,
  parseDateLocale,
  semaineIso,
} from './date'

/**
 * Propriétés (fast-check) de l'arithmétique des dates — complément des tests par
 * l'exemple de `date.test.ts`.
 *
 * Toute la GMAO raisonne en dates NUES locales (`date_prevue`, `date_debut`,
 * `date_cloture`…) et affiche systématiquement la semaine ISO. Une dérive d'un
 * jour au changement d'heure ou un numéro de semaine faux en bord d'année se
 * voient directement sur le planning mural.
 *
 * ORACLE COMMUN : un calendrier grégorien proleptique recalculé ici en
 * arithmétique ENTIÈRE pure (`joursDepuisEpoch`, algorithme « days_from_civil »),
 * sans `Date` ni fuseau. Aucun attendu n'est recopié d'une sortie observée.
 */

const CFG = { numRuns: 1000, seed: 42 } as const

// ── Oracle calendaire indépendant ─────────────────────────────────────────────

/** Nombre de jours depuis le 1970-01-01, calculé sans `Date` (H. Hinnant). */
function joursDepuisEpoch(a: number, m: number, j: number): number {
  const y = m <= 2 ? a - 1 : a
  const ere = Math.floor(y / 400)
  const anneeDansEre = y - ere * 400
  const jourDansAnnee =
    Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + j - 1
  const jourDansEre =
    anneeDansEre * 365 +
    Math.floor(anneeDansEre / 4) -
    Math.floor(anneeDansEre / 100) +
    jourDansAnnee
  return ere * 146097 + jourDansEre - 719468
}

/** Jour de la semaine, 0 = lundi … 6 = dimanche (1970-01-01 était un jeudi). */
function jourSemaineLundi0(jours: number): number {
  return (((jours + 3) % 7) + 7) % 7
}

function estBissextile(a: number): boolean {
  return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0
}

function joursDansLeMois(a: number, m: number): number {
  if (m === 2) return estBissextile(a) ? 29 : 28
  return [4, 6, 9, 11].includes(m) ? 30 : 31
}

/** Lundi (en jours depuis l'epoch) ouvrant la semaine 1 de l'année ISO `a`. */
function lundiSemaine1(a: number): number {
  // ISO 8601 : la semaine 1 est celle qui contient le 4 janvier.
  const quatreJanvier = joursDepuisEpoch(a, 1, 4)
  return quatreJanvier - jourSemaineLundi0(quatreJanvier)
}

/** Semaine ISO d'une date civile — oracle indépendant de `src/lib/date.ts`. */
function semaineIsoOracle(
  a: number,
  m: number,
  j: number,
): { numero: number; annee: number } {
  const d = joursDepuisEpoch(a, m, j)
  let annee = a
  if (d >= lundiSemaine1(a + 1)) annee = a + 1
  else if (d < lundiSemaine1(a)) annee = a - 1
  return { numero: Math.floor((d - lundiSemaine1(annee)) / 7) + 1, annee }
}

// ── Générateurs ───────────────────────────────────────────────────────────────

const deuxChiffres = (n: number) => String(n).padStart(2, '0')

/** Triplet calendaire VALIDE entre 1900 et 2100 (validité prononcée par l'oracle). */
const dateCivileValide = fc
  .tuple(
    fc.integer({ min: 1900, max: 2100 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 31 }),
  )
  .filter(([a, m, j]) => j <= joursDansLeMois(a, m))

const dateLocale = dateCivileValide.map(([a, m, j]) => new Date(a, m - 1, j))

/** Chaînes hostiles, en plus des chaînes aléatoires, pour les tests de totalité. */
const chaineHostile = fc.oneof(
  fc.string(),
  fc.string({ unit: 'binary' }),
  fc.constantFrom(
    '',
    ' ',
    'NaN',
    'Infinity',
    '-Infinity',
    '__proto__',
    'null',
    '0',
    '2026-02-30', // 30 février : date inexistante
    '2026-13-01', // mois 13
    '2026-00-00',
    '9999999999-01-01',
    '2026-06-07T25:00:00',
    'pas-une-date',
    '/Date(1234567890)/',
  ),
)

// ── Aller-retour ISO ↔ Date locale ────────────────────────────────────────────

describe('parseDateLocale / isoLocale — propriétés', () => {
  it('ALLER-RETOUR : isoLocale(parseDateLocale(iso)) === iso (1900-2100)', () => {
    // ORACLE : `parseDateLocale` et `isoLocale` sont deux bijections réciproques
    // entre l'ensemble des dates nues valides et celui des minuits locaux. La
    // composition doit donc être l'identité sur toute date valide — y compris
    // les 29 février et les jours entourant un changement d'heure, où un passage
    // par `toISOString()` (UTC) décalerait d'un jour.
    fc.assert(
      fc.property(dateCivileValide, ([a, m, j]) => {
        const iso = `${String(a)}-${deuxChiffres(m)}-${deuxChiffres(j)}`
        expect(isoLocale(parseDateLocale(iso))).toBe(iso)
      }),
      CFG,
    )
  })

  it("ALLER-RETOUR : la partie heure d'un ISO complet est ignorée", () => {
    // ORACLE : le contrat dit « seuls les 10 premiers caractères sont lus ». La
    // date nue lue ne doit donc dépendre d'aucune heure, ni du suffixe Z.
    fc.assert(
      fc.property(
        dateCivileValide,
        fc.integer({ min: 0, max: 23 }),
        fc.boolean(),
        ([a, m, j], heure, utc) => {
          const iso = `${String(a)}-${deuxChiffres(m)}-${deuxChiffres(j)}`
          const complet = `${iso}T${deuxChiffres(heure)}:30:00${utc ? 'Z' : ''}`
          expect(isoLocale(parseDateLocale(complet))).toBe(iso)
        },
      ),
      CFG,
    )
  })

  it('isoLocale respecte le gabarit AAAA-MM-JJ (mois et jour sur 2 chiffres)', () => {
    // ORACLE : le format est consommé par `<input type="date">` et par PostgreSQL
    // (type `date`) : ils exigent le zéro de tête.
    fc.assert(
      fc.property(dateLocale, (d) => {
        expect(isoLocale(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }),
      CFG,
    )
  })
})

// ── Arithmétique calendaire ───────────────────────────────────────────────────

describe('ajouterJours / ajouterSemaines — propriétés', () => {
  it('COMPOSITION : n pas de +1 jour === ajouterJours(d, n)', () => {
    // ORACLE : (Z, +) agit sur les jours du calendrier ; l'action est un
    // morphisme, donc itérer le générateur (+1) n fois équivaut à appliquer +n.
    // C'est LA propriété qui attrape les décalages de changement d'heure : une
    // implémentation en millisecondes (`getTime() + n * JOUR_MS`) dérive d'±1 h
    // par transition traversée et finit par sauter/redoubler un jour.
    fc.assert(
      fc.property(dateLocale, fc.integer({ min: -200, max: 200 }), (d, n) => {
        const pas = n >= 0 ? 1 : -1
        let courant = d
        for (let i = 0; i < Math.abs(n); i++) {
          courant = ajouterJours(courant, pas)
        }
        expect(isoLocale(courant)).toBe(isoLocale(ajouterJours(d, n)))
      }),
      { numRuns: 300, seed: 42 },
    )
  })

  it("AVANCE D'EXACTEMENT UN JOUR CALENDAIRE (oracle : jours depuis l'epoch)", () => {
    // ORACLE : l'écart entre `d` et `d+n` vaut exactement n jours dans le
    // calendrier grégorien, mesuré par l'oracle entier — indépendamment du
    // fuseau, de l'heure d'été et des années bissextiles.
    fc.assert(
      fc.property(
        dateCivileValide,
        fc.integer({ min: -3000, max: 3000 }),
        ([a, m, j], n) => {
          const decalee = ajouterJours(new Date(a, m - 1, j), n)
          const attendu = joursDepuisEpoch(a, m, j) + n
          const obtenu = joursDepuisEpoch(
            decalee.getFullYear(),
            decalee.getMonth() + 1,
            decalee.getDate(),
          )
          expect(obtenu).toBe(attendu)
        },
      ),
      CFG,
    )
  })

  it('ajouterJours ne MUTE PAS son argument', () => {
    // ORACLE : contrat explicite du module (« Ne mute pas l'entrée »). Les dates
    // sont partagées entre colonnes de planning : une mutation contaminerait
    // l'appelant.
    fc.assert(
      fc.property(dateLocale, fc.integer({ min: -400, max: 400 }), (d, n) => {
        const avant = d.getTime()
        ajouterJours(d, n)
        expect(d.getTime()).toBe(avant)
      }),
      CFG,
    )
  })

  it('ajouterSemaines CONSERVE le jour de la semaine', () => {
    // ORACLE : 7 ≡ 0 (mod 7) — décaler d'un multiple de 7 jours laisse la classe
    // modulo 7 inchangée. C'est ce qui garantit qu'une gamme hebdomadaire reste
    // sur la même colonne du planning d'une occurrence à l'autre.
    fc.assert(
      fc.property(dateLocale, fc.integer({ min: -520, max: 520 }), (d, n) => {
        expect(ajouterSemaines(d, n).getDay()).toBe(d.getDay())
      }),
      CFG,
    )
  })

  it('ajouterSemaines(d, n) === ajouterJours(d, 7n)', () => {
    // ORACLE : définition même de la semaine (7 jours).
    fc.assert(
      fc.property(dateLocale, fc.integer({ min: -520, max: 520 }), (d, n) => {
        expect(isoLocale(ajouterSemaines(d, n))).toBe(
          isoLocale(ajouterJours(d, 7 * n)),
        )
      }),
      CFG,
    )
  })

  it('reste à MINUIT local malgré les changements d’heure', () => {
    // ORACLE : le module travaille sur des dates nues ; toute sortie doit être un
    // minuit local (00:00:00.000), sinon les comparaisons de jours dérivent.
    fc.assert(
      fc.property(dateLocale, fc.integer({ min: -520, max: 520 }), (d, n) => {
        const r = ajouterSemaines(d, n)
        expect([r.getHours(), r.getMinutes(), r.getSeconds()]).toEqual([
          0, 0, 0,
        ])
      }),
      CFG,
    )
  })
})

describe('minuit — propriétés', () => {
  it('est IDEMPOTENT : minuit(minuit(d)) === minuit(d)', () => {
    // ORACLE : `minuit` est une projection (au sens algébrique) de l'axe du temps
    // vers les minuits locaux ; une projection vérifie p ∘ p = p.
    fc.assert(
      fc.property(
        fc.date({
          min: new Date(1900, 0, 1),
          max: new Date(2100, 11, 31),
          noInvalidDate: true,
        }),
        (d) => {
          const une = minuit(d)
          expect(minuit(une).getTime()).toBe(une.getTime())
        },
      ),
      CFG,
    )
  })

  it('ne MUTE PAS son argument et conserve la date calendaire', () => {
    // ORACLE : contrat explicite (« copie, sans muter l'entrée ») ; et la
    // projection ne change que l'heure, jamais le jour affiché.
    fc.assert(
      fc.property(
        fc.date({
          min: new Date(1900, 0, 1),
          max: new Date(2100, 11, 31),
          noInvalidDate: true,
        }),
        (d) => {
          const avant = d.getTime()
          const m = minuit(d)
          expect(d.getTime()).toBe(avant)
          expect(isoLocale(m)).toBe(isoLocale(d))
          expect([m.getHours(), m.getMinutes(), m.getSeconds()]).toEqual([
            0, 0, 0,
          ])
        },
      ),
      CFG,
    )
  })
})

// ── Semaines ISO 8601 ─────────────────────────────────────────────────────────

describe('semaineIso — confrontation à un oracle indépendant', () => {
  it('coïncide avec l’oracle ISO 8601 (numéro ET année) sur 1900-2100', () => {
    // ORACLE : ISO 8601 — semaines du lundi au dimanche, la semaine 1 est celle
    // qui contient le 4 janvier. L'oracle le calcule en jours entiers depuis
    // l'epoch, formulation totalement distincte de celle du module (qui passe par
    // le jeudi de la semaine).
    fc.assert(
      fc.property(dateCivileValide, ([a, m, j]) => {
        expect(semaineIso(new Date(a, m - 1, j))).toEqual(
          semaineIsoOracle(a, m, j),
        )
      }),
      CFG,
    )
  })

  it('le numéro appartient toujours à 1..53', () => {
    // ORACLE : une année ISO compte 52 ou 53 semaines — jamais 0, jamais 54.
    fc.assert(
      fc.property(dateCivileValide, ([a, m, j]) => {
        const { numero } = semaineIso(new Date(a, m - 1, j))
        expect(numero).toBeGreaterThanOrEqual(1)
        expect(numero).toBeLessThanOrEqual(53)
      }),
      CFG,
    )
  })

  it('numeroSemaineIso est la PROJECTION de semaineIso (source unique)', () => {
    // ORACLE : le module annonce « même algorithme, source unique ». Les deux
    // portes d'entrée doivent donc être indissociables.
    fc.assert(
      fc.property(dateLocale, (d) => {
        expect(numeroSemaineIso(d)).toBe(semaineIso(d).numero)
      }),
      CFG,
    )
  })

  it('le LUNDI d’une semaine porte le même couple (année ISO, numéro)', () => {
    // ORACLE : par définition, une semaine ISO est une classe d'équivalence de 7
    // jours consécutifs dont le lundi est le représentant. Le représentant
    // appartient nécessairement à sa propre classe.
    fc.assert(
      fc.property(dateLocale, (d) => {
        expect(semaineIso(lundiDeLaSemaine(d))).toEqual(semaineIso(d))
      }),
      CFG,
    )
  })

  it('les 7 jours à partir d’un lundi partagent la même semaine ISO', () => {
    // ORACLE : même définition, vue « en largeur » — et le 8e jour doit changer
    // de semaine (sinon la classe ferait plus de 7 jours).
    fc.assert(
      fc.property(dateLocale, (d) => {
        const lundi = lundiDeLaSemaine(d)
        const ref = semaineIso(lundi)
        for (let i = 0; i < 7; i++) {
          expect(semaineIso(ajouterJours(lundi, i))).toEqual(ref)
        }
        expect(semaineIso(ajouterJours(lundi, 7))).not.toEqual(ref)
      }),
      CFG,
    )
  })

  it('EXHAUSTIF : bascules 31/12 ↔ 01/01 de 1990 à 2100', () => {
    // ORACLE : l'oracle ISO ci-dessus. Les 5 derniers et 5 premiers jours de
    // chaque année sont le seul endroit où l'année ISO diverge de l'année
    // civile ; ils sont peu nombreux → on les couvre en exhaustif, pas au hasard.
    for (let a = 1990; a <= 2100; a++) {
      const jours: [number, number, number][] = []
      for (let j = 27; j <= 31; j++) jours.push([a, 12, j])
      for (let j = 1; j <= 5; j++) jours.push([a, 1, j])
      for (const [an, m, j] of jours) {
        expect(semaineIso(new Date(an, m - 1, j))).toEqual(
          semaineIsoOracle(an, m, j),
        )
      }
    }
  })

  it('EXHAUSTIF : années ISO à 53 semaines (2004, 2009, 2015, 2020, 2026)', () => {
    // ORACLE : une année ISO compte 53 semaines ssi elle commence un jeudi, ou
    // est bissextile et commence un mercredi. On vérifie jour par jour l'année
    // entière ET le fait qu'une semaine 53 existe bel et bien.
    for (const a of [2004, 2009, 2015, 2020, 2026]) {
      const commenceJeudi = jourSemaineLundi0(joursDepuisEpoch(a, 1, 1)) === 3
      const commenceMercredi =
        jourSemaineLundi0(joursDepuisEpoch(a, 1, 1)) === 2
      expect(commenceJeudi || (estBissextile(a) && commenceMercredi)).toBe(true)

      let vuSemaine53 = false
      for (let m = 1; m <= 12; m++) {
        for (let j = 1; j <= joursDansLeMois(a, m); j++) {
          const obtenu = semaineIso(new Date(a, m - 1, j))
          expect(obtenu).toEqual(semaineIsoOracle(a, m, j))
          if (obtenu.annee === a && obtenu.numero === 53) vuSemaine53 = true
        }
      }
      expect(vuSemaine53).toBe(true)
    }
  })

  it("EXHAUSTIF : les années à 52 semaines n'ont JAMAIS de semaine 53", () => {
    // ORACLE : contraposée de la règle ci-dessus — une année qui ne commence ni
    // un jeudi (ni un mercredi bissextile) compte exactement 52 semaines ISO.
    for (const a of [2005, 2010, 2016, 2021, 2025]) {
      const debut = jourSemaineLundi0(joursDepuisEpoch(a, 1, 1))
      expect(debut === 3 || (estBissextile(a) && debut === 2)).toBe(false)
      for (let m = 1; m <= 12; m++) {
        for (let j = 1; j <= joursDansLeMois(a, m); j++) {
          const { annee, numero } = semaineIso(new Date(a, m - 1, j))
          if (annee === a) expect(numero).toBeLessThanOrEqual(52)
        }
      }
    }
  })

  it('une date NUE lue en chaîne donne la même semaine que la même date locale', () => {
    // ORACLE : `numeroSemaineIso('2026-06-07')` et `numeroSemaineIso(new
    // Date(2026, 5, 7))` désignent le même jour du calendrier, donc la même
    // semaine ISO.
    // ⚠️ `new Date('AAAA-MM-JJ')` interprète la chaîne en UTC alors que
    // `semaineIso` relit des composantes LOCALES : cette propriété n'est vraie
    // que pour un fuseau à décalage POSITIF (Europe/Paris, fuseau de la GMAO).
    // Elle documente donc aussi la limite du module.
    fc.assert(
      fc.property(dateCivileValide, ([a, m, j]) => {
        const iso = `${String(a)}-${deuxChiffres(m)}-${deuxChiffres(j)}`
        expect(numeroSemaineIso(iso)).toBe(
          numeroSemaineIso(new Date(a, m - 1, j)),
        )
      }),
      CFG,
    )
  })
})

// ── Totalité des fonctions d'affichage ────────────────────────────────────────

describe('formats — totalité', () => {
  it('formatDate / formatDateLong / formatDateAvecSemaineIso / numeroSemaineIso ne jettent JAMAIS', () => {
    // ORACLE : ces fonctions sont appelées sur des colonnes de base éventuellement
    // nulles ou mal saisies (import CSV, données historiques). Leur contrat est
    // de replier sur « — » / `null`, jamais de faire tomber l'écran.
    fc.assert(
      fc.property(chaineHostile, (s) => {
        expect(typeof formatDate(s)).toBe('string')
        expect(typeof formatDateLong(s)).toBe('string')
        expect(typeof formatDateAvecSemaineIso(s)).toBe('string')
        const n = numeroSemaineIso(s)
        expect(n === null || Number.isInteger(n)).toBe(true)
      }),
      CFG,
    )
  })

  it('replient sur « — » (et null) dès que la date est vide ou invalide', () => {
    // ORACLE : contrat documenté du module. Une chaîne est invalide ssi
    // `new Date(s)` est NaN — c'est la définition, pas une observation.
    fc.assert(
      fc.property(chaineHostile, (s) => {
        const invalide = !s || Number.isNaN(new Date(s).getTime())
        if (invalide) {
          expect(formatDate(s)).toBe('—')
          expect(formatDateLong(s)).toBe('—')
          expect(formatDateAvecSemaineIso(s)).toBe('—')
          expect(numeroSemaineIso(s)).toBeNull()
        }
      }),
      CFG,
    )
  })

  it('null / undefined / chaîne vide sont toujours « — »', () => {
    // ORACLE : contrat explicite (« — si vide/invalide »).
    for (const v of [null, undefined, '']) {
      expect(formatDate(v)).toBe('—')
      expect(formatDateLong(v)).toBe('—')
      expect(formatDateAvecSemaineIso(v)).toBe('—')
      expect(numeroSemaineIso(v)).toBeNull()
    }
  })

  it('formatDateAvecSemaineIso = formatDate + « (numéro ISO) » sur date valide', () => {
    // ORACLE : composition annoncée par le module — pas de second calcul de
    // semaine, pas de second format de date.
    fc.assert(
      fc.property(dateLocale, (d) => {
        expect(formatDateAvecSemaineIso(d)).toBe(
          `${formatDate(d)} (${String(numeroSemaineIso(d))})`,
        )
      }),
      CFG,
    )
  })

  it('formatDate rend bien JJ/MM/AAAA pour toute date valide', () => {
    // ORACLE : format français (`Intl` fr-FR, jour/mois/année) attendu par l'UI.
    fc.assert(
      fc.property(dateCivileValide, ([a, m, j]) => {
        expect(formatDate(new Date(a, m - 1, j))).toBe(
          `${deuxChiffres(j)}/${deuxChiffres(m)}/${String(a)}`,
        )
      }),
      CFG,
    )
  })
})
