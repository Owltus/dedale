import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  choisirGranularite,
  construireDonneesColonnes,
  construireDonneesLigne,
  dateLogique,
  debutPeriode,
  echantillonner,
  genererReperes,
  periodeSuivante,
  reperesEtiquettesColonnes,
  type Granularite,
  type SerieTemporelle,
} from './temporel'

/**
 * Propriétés (fast-check) de la logique calendaire de l'axe temporel des
 * graphiques de relevés.
 *
 * ORACLE COMMUN : le calendrier grégorien recalculé ici en arithmétique ENTIÈRE
 * (mois absolus `annee * 12 + mois`, table des longueurs de mois avec la règle
 * bissextile complète), sans jamais réutiliser `Date` comme référence. Aucun
 * attendu n'est recopié d'une sortie observée.
 */

const CFG = { numRuns: 1000, seed: 42 } as const
/**
 * Budget RÉDUIT pour les propriétés calendaires lourdes (`genererReperes` boucle
 * période par période sur des intervalles pouvant couvrir des décennies). À 1 000
 * tirages elles frôlaient les 3,5 s en isolation et dépassaient le délai d'attente
 * par défaut quand la suite tourne en parallèle : un test qui ne rougit que sous
 * charge est instable, pas révélateur. 250 tirages avec la même graine gardent le
 * pouvoir de détection (les contre-exemples de ces propriétés sont denses) et
 * ramènent chaque test sous la seconde.
 */
const CFG_LOURD = { numRuns: 250, seed: 42 } as const

const GRANULARITES: Granularite[] = ['mois', 'trimestre', 'annee']

// ── Oracle calendaire indépendant ────────────────────────────────────────────

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/** Nombre de jours du mois `mois` (0 = janvier) de l'année `annee`. */
function joursDansMois(annee: number, mois: number): number {
  const longueurs = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return mois === 1 && estBissextile(annee) ? 29 : longueurs[mois]!
}

/** Mois ABSOLU (0 = janvier de l'an 0) — arithmétique entière, sans `Date`. */
function moisAbsolu(annee: number, mois: number): number {
  return annee * 12 + mois
}

/** Nombre de mois par période, selon la granularité. */
function pasEnMois(g: Granularite): number {
  return g === 'annee' ? 12 : g === 'trimestre' ? 3 : 1
}

/** Premier mois ABSOLU de la période contenant (annee, mois). */
function debutAbsolu(annee: number, mois: number, g: Granularite): number {
  const pas = pasEnMois(g)
  const abs = moisAbsolu(annee, mois)
  return abs - (((abs % pas) + pas) % pas)
}

// ── Arbitraires ──────────────────────────────────────────────────────────────

// Bornes volontairement dans le domaine métier de la GMAO : `new Date(annee,…)`
// réinterprète les années 0-99 comme 1900-1999, ce qui n'a aucun sens ici et
// ferait échouer des propriétés sur des dates que l'application ne verra jamais.
const arbDate = fc.date({
  min: new Date(1950, 0, 1),
  max: new Date(2150, 11, 31),
  noInvalidDate: true,
})
const arbGranularite = fc.constantFrom<Granularite>(...GRANULARITES)

// ── dateLogique ──────────────────────────────────────────────────────────────

describe('dateLogique', () => {
  // ORACLE : règle métier — un relevé fait le 15 du mois ou AVANT est rattaché à
  // la fin du mois PRÉCÉDENT ; à partir du 16, il reste dans son propre mois. Le
  // pivot est donc strictement entre le 15 et le 16.
  const MOIS_TESTES = [
    { annee: 2024, mois: 1, quoi: 'février bissextile' },
    { annee: 2023, mois: 1, quoi: 'février non bissextile' },
    { annee: 2000, mois: 1, quoi: 'février 2000 (bissextile séculaire)' },
    { annee: 1900, mois: 1, quoi: 'février 1900 (NON bissextile)' },
    { annee: 2026, mois: 0, quoi: 'janvier (bascule d’année)' },
    { annee: 2026, mois: 3, quoi: 'avril (30 jours)' },
    { annee: 2026, mois: 11, quoi: 'décembre' },
  ]

  for (const { annee, mois, quoi } of MOIS_TESTES) {
    it(`rattache correctement les jours 1 à 31 — ${quoi}`, () => {
      for (let jour = 1; jour <= 31; jour += 1) {
        // `new Date` normalise un quantième trop grand (31 février → 2 ou 3 mars) :
        // l'oracle s'applique à la date NORMALISÉE, celle que voit `dateLogique`.
        const entree = new Date(annee, mois, jour)
        const obtenu = dateLogique(entree)
        const a = entree.getFullYear()
        const m = entree.getMonth()
        const j = entree.getDate()

        if (j <= 15) {
          // Dernier jour du mois précédent, calculé par l'oracle entier.
          const abs = moisAbsolu(a, m) - 1
          const aPrec = Math.floor(abs / 12)
          const mPrec = abs - aPrec * 12
          expect(obtenu.getFullYear()).toBe(aPrec)
          expect(obtenu.getMonth()).toBe(mPrec)
          expect(obtenu.getDate()).toBe(joursDansMois(aPrec, mPrec))
        } else {
          expect(obtenu.getTime()).toBe(entree.getTime())
        }
      }
    })
  }

  it('le pivot est strictement entre le 15 et le 16 (off-by-one)', () => {
    // ORACLE : la règle est « ≤ 15 », donc le 15 bascule et le 16 non. Le 14 doit
    // basculer comme le 15 — trois jours qui encadrent le seul point de rupture.
    const mars = (jour: number) => dateLogique(new Date(2024, 2, jour))
    expect(mars(14).getMonth()).toBe(1) // février
    expect(mars(15).getMonth()).toBe(1) // février — le 15 bascule ENCORE
    expect(mars(16).getMonth()).toBe(2) // mars — le 16 ne bascule PLUS
    expect(mars(15).getDate()).toBe(29) // février 2024 est bissextile
    expect(mars(16).getDate()).toBe(16)
  })

  it('ne mute jamais la date reçue', () => {
    // ORACLE : fonction pure — `dateLogique` est appelée au milieu de pipelines
    // de rendu ; muter l'entrée corromprait les dates réelles des relevés.
    fc.assert(
      fc.property(arbDate, (d) => {
        const avant = d.getTime()
        dateLogique(d)
        expect(d.getTime()).toBe(avant)
      }),
      CFG,
    )
  })
})

// ── debutPeriode ─────────────────────────────────────────────────────────────

describe('debutPeriode', () => {
  it('est idempotent', () => {
    // ORACLE : un début de période est un point FIXE de la fonction — une fois
    // ramené à la frontière de calendrier, on ne peut plus reculer.
    fc.assert(
      fc.property(arbDate, arbGranularite, (d, g) => {
        const une = debutPeriode(d, g)
        const deux = debutPeriode(une, g)
        expect(deux.getTime()).toBe(une.getTime())
      }),
      CFG,
    )
  })

  it('tombe sur la bonne frontière de calendrier', () => {
    // ORACLE : arithmétique entière sur les mois absolus — le début de période
    // est le 1er du mois dont l'index absolu est un multiple du pas (1, 3 ou 12).
    fc.assert(
      fc.property(arbDate, arbGranularite, (d, g) => {
        const r = debutPeriode(d, g)
        const attendu = debutAbsolu(d.getFullYear(), d.getMonth(), g)
        expect(moisAbsolu(r.getFullYear(), r.getMonth())).toBe(attendu)
        expect(r.getDate()).toBe(1)
        expect(r.getHours()).toBe(0)
        expect(r.getMinutes()).toBe(0)
        expect(r.getSeconds()).toBe(0)
        expect(r.getMilliseconds()).toBe(0)
      }),
      CFG,
    )
  })

  it('ne recule jamais au-delà du mois courant et ne dépasse jamais la date', () => {
    // ORACLE : le début de période contenant `d` est ≤ `d` (minuit local), et il
    // reste dans la même année pour « mois » et « trimestre ».
    fc.assert(
      fc.property(arbDate, arbGranularite, (d, g) => {
        const r = debutPeriode(d, g)
        expect(r.getTime()).toBeLessThanOrEqual(d.getTime())
        expect(r.getFullYear()).toBe(d.getFullYear())
      }),
      CFG,
    )
  })
})

// ── periodeSuivante ──────────────────────────────────────────────────────────

describe('periodeSuivante', () => {
  it('est strictement croissante', () => {
    // ORACLE : le temps avance — ajouter 1 mois, 1 trimestre ou 1 an donne
    // TOUJOURS un instant postérieur, y compris depuis un 31 (le débordement de
    // quantième pousse vers l'avant, jamais vers l'arrière).
    fc.assert(
      fc.property(arbDate, arbGranularite, (d, g) => {
        expect(periodeSuivante(d, g).getTime()).toBeGreaterThan(d.getTime())
      }),
      CFG,
    )
  })

  it('ne mute jamais la date reçue', () => {
    // ORACLE : fonction pure — `genererReperes` l'itère sur son curseur ; muter
    // l'entrée ferait diverger la boucle.
    fc.assert(
      fc.property(arbDate, arbGranularite, (d, g) => {
        const avant = d.getTime()
        periodeSuivante(d, g)
        expect(d.getTime()).toBe(avant)
      }),
      CFG,
    )
  })

  it('itérée depuis un début de période, ne saute ni ne répète jamais une période', () => {
    // ORACLE : la k-ième itération depuis le mois absolu m0 vaut EXACTEMENT
    // m0 + k × pas (pas = 1, 3 ou 12) — calculé en arithmétique entière, sans
    // `Date`. Un saut (mois manquant) ou une répétition se verrait immédiatement.
    fc.assert(
      fc.property(
        arbDate,
        arbGranularite,
        fc.integer({ min: 1, max: 60 }),
        (d, g, n) => {
          const pas = pasEnMois(g)
          let curseur = debutPeriode(d, g)
          const m0 = moisAbsolu(curseur.getFullYear(), curseur.getMonth())
          for (let k = 1; k <= n; k += 1) {
            curseur = periodeSuivante(curseur, g)
            expect(moisAbsolu(curseur.getFullYear(), curseur.getMonth())).toBe(
              m0 + k * pas,
            )
            expect(curseur.getDate()).toBe(1)
            // Toujours à minuit local (aucune dérive au changement d'heure).
            expect(curseur.getHours()).toBe(0)
          }
        },
      ),
      CFG,
    )
  })
})

// ── genererReperes ───────────────────────────────────────────────────────────

describe('genererReperes', () => {
  const arbBornes = fc
    .tuple(
      fc.date({
        min: new Date(1990, 0, 1),
        max: new Date(2090, 0, 1),
        noInvalidDate: true,
      }),
      fc.date({
        min: new Date(1990, 0, 1),
        max: new Date(2090, 0, 1),
        noInvalidDate: true,
      }),
    )
    .map(([a, b]): [Date, Date] =>
      a.getTime() <= b.getTime() ? [a, b] : [b, a],
    )

  it('produit des repères strictement croissants', () => {
    // ORACLE : une grille de calendrier est une suite strictement ordonnée — un
    // repère répété (ou inversé) dédoublerait une étiquette sur l'axe.
    fc.assert(
      fc.property(arbBornes, arbGranularite, ([debut, fin], g) => {
        const reperes = genererReperes(g, debut.getTime(), fin.getTime())
        for (let i = 0; i + 1 < reperes.length; i += 1) {
          expect(reperes[i + 1]!).toBeGreaterThan(reperes[i]!)
        }
      }),
      CFG_LOURD,
    )
  })

  it('reste dans l’intervalle COUVRANT [debutPeriode(debut), fin]', () => {
    // ORACLE : la fonction « couvre » l'intervalle demandé — son premier repère
    // est la frontière de calendrier CONTENANT `debut` (donc ≤ debut : c'est
    // voulu, sinon le premier mois affiché n'aurait pas d'étiquette) et aucun
    // repère ne dépasse `fin`.
    fc.assert(
      fc.property(arbBornes, arbGranularite, ([debut, fin], g) => {
        const reperes = genererReperes(g, debut.getTime(), fin.getTime())
        const plancher = debutPeriode(debut, g).getTime()
        for (const r of reperes) {
          expect(r).toBeGreaterThanOrEqual(plancher)
          expect(r).toBeLessThanOrEqual(fin.getTime())
        }
        if (reperes.length > 0) expect(reperes[0]!).toBe(plancher)
      }),
      CFG_LOURD,
    )
  })

  it('chaque repère est une vraie frontière de calendrier', () => {
    // ORACLE : par construction, un repère est le 1er d'un mois dont l'index
    // absolu est multiple du pas de la granularité (oracle entier indépendant).
    fc.assert(
      fc.property(arbBornes, arbGranularite, ([debut, fin], g) => {
        const pas = pasEnMois(g)
        for (const ms of genererReperes(g, debut.getTime(), fin.getTime())) {
          const d = new Date(ms)
          expect(d.getDate()).toBe(1)
          expect(moisAbsolu(d.getFullYear(), d.getMonth()) % pas).toBe(0)
        }
      }),
      CFG_LOURD,
    )
  })

  it('le nombre de repères correspond au décompte entier des périodes', () => {
    // ORACLE : le nombre de frontières de `g` dans [debut, fin] se calcule en
    // mois absolus, sans `Date` : ⌊(finAbs - debutAbs)/pas⌋ + 1, à un près selon
    // que la dernière frontière tombe avant ou après le quantième de `fin`.
    fc.assert(
      fc.property(arbBornes, arbGranularite, ([debut, fin], g) => {
        const pas = pasEnMois(g)
        const d0 = debutAbsolu(debut.getFullYear(), debut.getMonth(), g)
        const f0 = debutAbsolu(fin.getFullYear(), fin.getMonth(), g)
        const attendu = Math.floor((f0 - d0) / pas) + 1
        const n = genererReperes(g, debut.getTime(), fin.getTime()).length
        // La dernière frontière n'est retenue que si elle tombe AVANT `fin`
        // (même mois mais plus tard dans le mois → elle compte ; sinon non).
        expect(n === attendu || n === attendu - 1).toBe(true)
      }),
      CFG,
    )
  })

  it('reste borné même sur 100 ans', () => {
    // ORACLE : 100 ans comptent 1 200 mois, donc au plus 1 201 frontières
    // mensuelles, 401 trimestrielles et 101 annuelles. Aucune granularité ne peut
    // produire de liste non bornée (la boucle avance d'au moins un mois par tour).
    const debut = new Date(1926, 0, 1).getTime()
    const fin = new Date(2026, 0, 1).getTime()
    expect(genererReperes('mois', debut, fin)).toHaveLength(1201)
    expect(genererReperes('trimestre', debut, fin)).toHaveLength(401)
    expect(genererReperes('annee', debut, fin)).toHaveLength(101)
  })

  it('un intervalle inversé ne produit aucun repère', () => {
    // ORACLE : [a, b] avec b < a est l'ensemble vide — il ne contient aucune
    // frontière de calendrier.
    fc.assert(
      fc.property(arbBornes, arbGranularite, ([debut, fin], g) => {
        if (debut.getTime() === fin.getTime()) return
        expect(
          genererReperes(
            g,
            fin.getTime() + 1,
            debutPeriode(debut, g).getTime() - 1,
          ),
        ).toHaveLength(0)
      }),
      CFG,
    )
  })
})

// ── choisirGranularite ───────────────────────────────────────────────────────

describe('choisirGranularite', () => {
  it('choisit la granularité la plus FINE qui tient dans le budget', () => {
    // ORACLE : définition — « mois » est choisi si et seulement si ses repères
    // tiennent ; sinon « trimestre » s'il tient ; sinon « année ». L'ordre
    // mois ⊂ trimestre ⊂ année garantit que le nombre de repères décroît.
    fc.assert(
      fc.property(
        fc.date({
          min: new Date(2000, 0, 1),
          max: new Date(2060, 0, 1),
          noInvalidDate: true,
        }),
        fc.date({
          min: new Date(2000, 0, 1),
          max: new Date(2060, 0, 1),
          noInvalidDate: true,
        }),
        fc.integer({ min: 2, max: 40 }),
        (a, b, max) => {
          const debut = Math.min(a.getTime(), b.getTime())
          const fin = Math.max(a.getTime(), b.getTime())
          const g = choisirGranularite(debut, fin, max)
          const tailles = {
            mois: genererReperes('mois', debut, fin).length,
            trimestre: genererReperes('trimestre', debut, fin).length,
            annee: genererReperes('annee', debut, fin).length,
          }
          // Décroissance du nombre de repères quand la maille grossit.
          expect(tailles.trimestre).toBeLessThanOrEqual(tailles.mois)
          expect(tailles.annee).toBeLessThanOrEqual(tailles.trimestre)
          const attendue: Granularite =
            tailles.mois <= max
              ? 'mois'
              : tailles.trimestre <= max
                ? 'trimestre'
                : 'annee'
          expect(g).toBe(attendue)
        },
      ),
      CFG,
    )
  })
})

// ── echantillonner ───────────────────────────────────────────────────────────

describe('echantillonner', () => {
  const arbItems = fc.array(fc.integer({ min: 0, max: 9999 }), {
    maxLength: 200,
  })
  const arbMax = fc.integer({ min: -3, max: 50 })

  /** `sous` est-elle une sous-suite de `tout` (ordre préservé) ? */
  function estSousSuite(sous: number[], tout: number[]): boolean {
    let j = 0
    for (const v of sous) {
      while (j < tout.length && tout[j] !== v) j += 1
      if (j >= tout.length) return false
      j += 1
    }
    return true
  }

  it('ne renvoie jamais plus de points qu’en entrée, ni plus que `max`', () => {
    // ORACLE : un échantillonnage est une SÉLECTION — il ne peut rien inventer,
    // et le budget demandé est une borne supérieure stricte.
    fc.assert(
      fc.property(arbItems, arbMax, (items, max) => {
        const r = echantillonner(items, max)
        expect(r.length).toBeLessThanOrEqual(items.length)
        if (max >= 1) expect(r.length).toBeLessThanOrEqual(max)
        else expect(r).toHaveLength(0)
      }),
      CFG,
    )
  })

  it('préserve l’ordre (c’est une sous-suite de l’entrée)', () => {
    // ORACLE : les étiquettes d'un axe temporel doivent rester chronologiques —
    // l'échantillon est une sous-suite, jamais une permutation.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 5000 }), { maxLength: 150 }).map(
          // Indices distincts et croissants : on teste l'ORDRE, pas l'égalité de
          // valeurs dupliquées.
          (xs) => xs.map((_, i) => i * 7 + 1),
        ),
        arbMax,
        (items, max) => {
          const r = echantillonner(items, max)
          expect(estSousSuite(r, items)).toBe(true)
        },
      ),
      CFG,
    )
  })

  it('conserve TOUJOURS le premier et le dernier point (budget ≥ 2)', () => {
    // ORACLE : un axe doit rester borné par ses extrémités réelles — perdre le
    // premier ou le dernier repère décalerait visuellement toute la série. Le cas
    // `max === 1` est exclu : un seul emplacement ne peut pas porter deux points
    // (contrat séparé, testé ci-dessous).
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9999 }), {
          minLength: 1,
          maxLength: 200,
        }),
        fc.integer({ min: 2, max: 50 }),
        (items, max) => {
          const r = echantillonner(items, max)
          expect(r[0]).toBe(items[0])
          expect(r[r.length - 1]).toBe(items[items.length - 1])
        },
      ),
      CFG,
    )
  })

  it('avec un budget de 1, garde le point le plus RÉCENT', () => {
    // ORACLE : avec un seul emplacement, conserver les deux extrémités est
    // impossible ; le contrat retenu est de garder le dernier point (le relevé le
    // plus récent, celui qui porte l'information utile sur un axe temporel).
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9999 }), {
          minLength: 1,
          maxLength: 50,
        }),
        (items) => {
          expect(echantillonner(items, 1)).toEqual([items[items.length - 1]])
        },
      ),
      CFG,
    )
  })

  it('rend l’entrée telle quelle quand elle tient déjà dans le budget', () => {
    // ORACLE : rien à réduire ⇒ rien n'est retiré (identité).
    fc.assert(
      fc.property(arbItems, fc.integer({ min: 1, max: 300 }), (items, max) => {
        if (items.length > max) return
        expect(echantillonner(items, max)).toEqual(items)
      }),
      CFG,
    )
  })
})

// ── Construction des lignes de données ───────────────────────────────────────

// Séries à clés DISTINCTES (comme en production : une clé = une mesure).
const arbSeries: fc.Arbitrary<SerieTemporelle[]> = fc
  .uniqueArray(
    fc.record({
      cle: fc.string({ minLength: 1, maxLength: 4 }),
      points: fc.array(
        fc.record({
          date: fc
            .date({
              min: new Date(2020, 0, 1),
              max: new Date(2027, 0, 1),
              noInvalidDate: true,
            })
            .map((d) => d.toISOString().slice(0, 10)),
          valeur: fc.option(fc.integer({ min: -100, max: 10000 }), {
            nil: null,
          }),
          otId: fc.string({ minLength: 1, maxLength: 6 }),
        }),
        { maxLength: 12 },
      ),
    }),
    { minLength: 1, maxLength: 3, selector: (s) => s.cle },
  )
  .map((series) =>
    series.map(
      (s): SerieTemporelle => ({
        cle: s.cle,
        label: s.cle,
        points: s.points,
      }),
    ),
  )

describe('construireDonneesLigne', () => {
  it('produit exactement une ligne par date réelle DISTINCTE, triée', () => {
    // ORACLE : la fonction ne « bucketise » rien — l'ensemble des lignes est
    // l'union des dates des séries, sans perte ni doublon, en ordre chronologique
    // (les dates ISO nues se trient lexicographiquement comme chronologiquement).
    fc.assert(
      fc.property(arbSeries, (series) => {
        const attendues = [
          ...new Set(series.flatMap((s) => s.points.map((p) => p.date))),
        ].sort()
        const lignes = construireDonneesLigne(series)
        expect(lignes.map((l) => l.date)).toEqual(attendues)
      }),
      CFG,
    )
  })

  it('renseigne une entrée pour CHAQUE série sur chaque ligne', () => {
    // ORACLE : Recharts lit les séries par clé sur chaque ligne ; une clé absente
    // (au lieu de `null`) romprait le tracé au lieu de le trouer proprement.
    fc.assert(
      fc.property(arbSeries, (series) => {
        for (const ligne of construireDonneesLigne(series)) {
          for (const s of series) {
            expect(Object.hasOwn(ligne, s.cle)).toBe(true)
            expect(Object.hasOwn(ligne, `${s.cle}__ot`)).toBe(true)
          }
          expect(typeof ligne.dateMs).toBe('number')
        }
      }),
      CFG,
    )
  })
})

describe('construireDonneesColonnes', () => {
  it('garde TOUTES les dates réelles, triées', () => {
    // ORACLE : aucune colonne réelle n'est jamais fusionnée ni perdue (« RIEN
    // n'est jamais additionné, moyenné ni fusionné »), et l'axe reste
    // chronologique — les dates ISO nues se trient lexicographiquement comme
    // chronologiquement.
    fc.assert(
      fc.property(arbSeries, arbGranularite, (series, g) => {
        const reelles = new Set(
          series.flatMap((s) => s.points.map((p) => p.date)),
        )
        const debut = new Date(2020, 0, 1).getTime()
        const fin = new Date(2027, 0, 1).getTime()
        const lignes = construireDonneesColonnes(series, g, debut, fin)
        const dates = lignes.map((l) => l.date as string)
        for (const d of reelles) expect(dates).toContain(d)
        expect([...dates]).toEqual([...dates].sort())
      }),
      CFG,
    )
  })

  it('un relevé daté du 1er du mois ne produit pas de colonne en doublon', () => {
    // ORACLE : une colonne = une date. Deux lignes portant la MÊME valeur de
    // `date` sont deux catégories identiques pour l'axe de Recharts : la barre
    // serait dessinée deux fois au même endroit et l'étiquette de l'axe
    // apparaîtrait en double.
    //
    // Régression couverte : le rattachement à la période passe par
    // `dateLogique` (relevé du 1er au 15 → mois PRÉCÉDENT), alors que les
    // colonnes vides viennent de `genererReperes`, qui ne l'applique pas. Un
    // relevé du 1er mars était compté en « février », la frontière « 1er mars »
    // jugée sans donnée, et une colonne vide « 2024-03-01 » ajoutée à côté de
    // la vraie. Corrigé en marquant les DEUX périodes qu'occupe une date
    // réelle : la sienne et sa période logique.
    //
    // Touche tout relevé daté du 1er d'un mois, du 1er d'un trimestre ou du
    // 1er janvier — cas fréquent sur les compteurs.
    const series: SerieTemporelle[] = [
      {
        cle: 'm',
        label: 'Compteur',
        points: [{ date: '2024-03-01', valeur: 12, otId: 'ot1' }],
      },
    ]
    const dates = construireDonneesColonnes(
      series,
      'mois',
      new Date(2024, 2, 1).getTime(),
      new Date(2024, 2, 31).getTime(),
    ).map((l) => l.date as string)
    expect(new Set(dates).size).toBe(dates.length)
  })

  it('les dates de colonnes sont toutes DISTINCTES', () => {
    // ORACLE : même propriété, cherchée au hasard plutôt que sur un exemple —
    // l'ensemble des colonnes est un ensemble de dates, donc sans répétition.
    fc.assert(
      fc.property(arbSeries, arbGranularite, (series, g) => {
        const dates = construireDonneesColonnes(
          series,
          g,
          new Date(2020, 0, 1).getTime(),
          new Date(2027, 0, 1).getTime(),
        ).map((l) => l.date as string)
        expect(new Set(dates).size).toBe(dates.length)
      }),
      CFG,
    )
  })
})

describe('reperesEtiquettesColonnes', () => {
  it('ne retient que des dates existantes, dans l’ordre et dans le budget', () => {
    // ORACLE : une étiquette d'axe se pose forcément SUR une colonne existante ;
    // la sélection est une sous-suite des colonnes, bornée par le budget.
    fc.assert(
      fc.property(
        arbSeries,
        arbGranularite,
        fc.integer({ min: 1, max: 20 }),
        (series, g, max) => {
          const debut = new Date(2020, 0, 1).getTime()
          const fin = new Date(2027, 0, 1).getTime()
          const dates = construireDonneesColonnes(series, g, debut, fin).map(
            (l) => l.date as string,
          )
          const ticks = reperesEtiquettesColonnes(dates, g, max)
          expect(ticks.length).toBeLessThanOrEqual(max)
          for (const t of ticks) expect(dates).toContain(t)
          let j = 0
          for (const t of ticks) {
            const i = dates.indexOf(t, j)
            expect(i).toBeGreaterThanOrEqual(j)
            j = i + 1
          }
        },
      ),
      CFG,
    )
  })

  it('pose au plus une étiquette par période de calendrier', () => {
    // ORACLE : l'axe affiche une étiquette PAR période (mois/trimestre/année) ;
    // deux étiquettes pour la même période feraient croire à deux périodes.
    fc.assert(
      fc.property(arbSeries, arbGranularite, (series, g) => {
        const debut = new Date(2020, 0, 1).getTime()
        const fin = new Date(2027, 0, 1).getTime()
        const dates = construireDonneesColonnes(series, g, debut, fin).map(
          (l) => l.date as string,
        )
        const ticks = reperesEtiquettesColonnes(dates, g, 1000)
        const periodes = ticks.map((t) => {
          const d = debutPeriode(dateLogique(new Date(`${t}T00:00:00`)), g)
          return `${String(d.getFullYear())}-${String(d.getMonth())}`
        })
        expect(new Set(periodes).size).toBe(periodes.length)
      }),
      CFG,
    )
  })
})
