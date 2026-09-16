import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  ajouterJoursIso,
  ajouterMoisIso,
  alerteContrat,
  chaineDeVersions,
  etatContrat,
  evenementsContrat,
  fenetrePreavisContrat,
  nbAvenantsDirects,
  prochaineEcheanceContrat,
  progressionContrat,
  resiliationDeclaree,
  SEUIL_ALERTE_DANGER_JOURS,
  SEUIL_ALERTE_WARNING_JOURS,
  statutContrat,
  texteContrat,
  TYPE_CONTRAT,
  type DonneesContrat,
  type NoeudVersion,
} from './etat'

// ─────────────────────────────────────────────────────────────────────────────
// Ce fichier teste l'arithmétique calendaire des contrats de maintenance.
// RÈGLE : chaque test cite son ORACLE (la règle calendaire ou métier qui le
// justifie), jamais une valeur recopiée de la sortie observée — sinon on fige
// le bug au lieu de le trouver. Les oracles de date sont recalculés ICI, à la
// main (jours par mois + bissextile, arithmétique en UTC), indépendamment du
// code de production.
// ─────────────────────────────────────────────────────────────────────────────

const PARAMS = { numRuns: 500, seed: 42 }

// ── Oracles calendaires indépendants ──────────────────────────────────────────

/** Règle grégorienne : divisible par 4, sauf les siècles non divisibles par 400. */
function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0
}

/** Nombre de jours du mois `mois` (1-12) de l'année `annee`. */
function joursDansMois(annee: number, mois: number): number {
  const table = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (mois === 2 && estBissextile(annee)) return 29
  return table[mois - 1] ?? 30
}

/** Assemble une date nue `AAAA-MM-JJ` (4/2/2 chiffres). */
function iso(annee: number, mois: number, jour: number): string {
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`
}

/** Composantes d'une date nue de test (jette si le test se trompe de format). */
function comp(date: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) throw new Error(`date de test mal formée : ${date}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/**
 * ORACLE « ajouter n mois » : règle de quantième à quantième avec RABOTAGE en
 * fin de mois — la règle universelle du calendrier (et celle de PostgreSQL :
 * `date '2026-01-31' + interval '1 month'` = 2026-02-28, ainsi que celle du
 * droit français des contrats, art. 641 du code de procédure civile).
 * Le 31 janvier + 1 mois = 28 février (29 en bissextile), JAMAIS le 3 mars.
 */
function ajouterMoisOracle(date: string, mois: number): string {
  const [a, m, j] = comp(date)
  const total = a * 12 + (m - 1) + mois
  const na = Math.floor(total / 12)
  const nm = (((total % 12) + 12) % 12) + 1
  return iso(na, nm, Math.min(j, joursDansMois(na, nm)))
}

/**
 * ORACLE « ajouter n jours » : arithmétique en UTC (86 400 000 ms par jour,
 * aucun changement d'heure en UTC) — indépendante du code testé, qui lui passe
 * par le constructeur `Date` local.
 */
function ajouterJoursOracle(date: string, jours: number): string {
  const [a, m, j] = comp(date)
  const d = new Date(Date.UTC(a, m - 1, j))
  d.setUTCDate(d.getUTCDate() + jours)
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
}

/** ORACLE « écart en jours entiers » (UTC, cf. `ajouterJoursOracle`). */
function ecartJoursOracle(jusqu: string, depuis: string): number {
  const [a1, m1, j1] = comp(jusqu)
  const [a2, m2, j2] = comp(depuis)
  return Math.round(
    (Date.UTC(a1, m1 - 1, j1) - Date.UTC(a2, m2 - 1, j2)) / 86_400_000,
  )
}

// ── Générateurs ───────────────────────────────────────────────────────────────

/** Date nue VALIDE entre 1990 et 2100 (le jour est raboté sur le mois réel). */
const arbDateIso = fc
  .record({
    a: fc.integer({ min: 1990, max: 2100 }),
    m: fc.integer({ min: 1, max: 12 }),
    j: fc.integer({ min: 1, max: 31 }),
  })
  .map(({ a, m, j }) => iso(a, m, Math.min(j, joursDansMois(a, m))))

/** Chaînes qui ne sont PAS des dates (dont une date inexistante bien formée). */
const arbDateChaotique = fc.oneof(
  arbDateIso,
  fc.constantFrom(
    '2026-02-30',
    '2026-13-01',
    '0000-00-00',
    '',
    'pas une date',
    '20260101',
    '2026-1-1',
  ),
)

const CONTRAT_BASE: DonneesContrat = {
  type_contrat_id: TYPE_CONTRAT.tacite,
  date_debut: '2025-01-01',
  date_fin: null,
  date_signature: null,
  date_resiliation: null,
  date_notification: null,
  delai_preavis_jours: 30,
  duree_cycle_mois: 12,
  fenetre_resiliation_jours: 30,
  est_archive: false,
}

/**
 * Contrat COHÉRENT : toutes les dates dérivées de `date_debut` par décalages
 * positifs/négatifs, de façon à respecter les CHECK de la base
 * (`signature <= debut <= fin`, `resiliation >= debut`, `notification <=
 * resiliation`) — cf. les `refine` de `schemas.ts`.
 */
const arbContratValide: fc.Arbitrary<DonneesContrat> = fc
  .tuple(
    fc.constantFrom(
      TYPE_CONTRAT.determine,
      TYPE_CONTRAT.tacite,
      TYPE_CONTRAT.indetermine,
    ),
    arbDateIso,
    fc.option(fc.integer({ min: 0, max: 3650 }), { nil: null }),
    fc.option(fc.integer({ min: 0, max: 400 }), { nil: null }),
    fc.option(fc.integer({ min: 0, max: 3650 }), { nil: null }),
    fc.option(fc.integer({ min: 0, max: 365 }), { nil: null }),
    fc.integer({ min: 0, max: 180 }),
    fc.option(fc.integer({ min: 1, max: 60 }), { nil: null }),
    fc.option(fc.integer({ min: 1, max: 180 }), { nil: null }),
    fc.boolean(),
  )
  .map(
    ([
      type,
      debut,
      finApres,
      signAvant,
      resilApres,
      notifAvant,
      preavis,
      cycle,
      fenetre,
      archive,
    ]) => {
      const resiliation =
        resilApres == null ? null : ajouterJoursOracle(debut, resilApres)
      const notification =
        notifAvant == null
          ? null
          : resiliation
            ? ajouterJoursOracle(resiliation, -notifAvant)
            : ajouterJoursOracle(debut, notifAvant)
      return {
        type_contrat_id: type,
        date_debut: debut,
        date_fin: finApres == null ? null : ajouterJoursOracle(debut, finApres),
        date_signature:
          signAvant == null ? null : ajouterJoursOracle(debut, -signAvant),
        date_resiliation: resiliation,
        date_notification: notification,
        delai_preavis_jours: preavis,
        duree_cycle_mois: cycle,
        fenetre_resiliation_jours: fenetre,
        est_archive: archive,
      }
    },
  )

/**
 * Contrat INCOHÉRENT : dates invalides ou nulles, fin avant début, cycle nul ou
 * négatif, préavis négatif, type inconnu. Sert aux propriétés de TOTALITÉ
 * (aucune fonction ne doit jeter). Les bornes restent raisonnables pour que la
 * boucle de `prochaineEcheanceContrat` ne coûte pas des secondes.
 */
const arbContratChaotique: fc.Arbitrary<DonneesContrat> = fc.record({
  type_contrat_id: fc.integer({ min: -2, max: 9 }),
  date_debut: arbDateChaotique,
  date_fin: fc.option(arbDateChaotique, { nil: null }),
  date_signature: fc.option(arbDateChaotique, { nil: null }),
  date_resiliation: fc.option(arbDateChaotique, { nil: null }),
  date_notification: fc.option(arbDateChaotique, { nil: null }),
  delai_preavis_jours: fc.integer({ min: -90, max: 400 }),
  duree_cycle_mois: fc.option(fc.integer({ min: -12, max: 120 }), {
    nil: null,
  }),
  fenetre_resiliation_jours: fc.option(fc.integer({ min: -30, max: 400 }), {
    nil: null,
  }),
  est_archive: fc.option(fc.boolean(), { nil: undefined }),
})

// ═════════════════════════════════════════════════════════════════════════════
// ajouterMoisIso
// ═════════════════════════════════════════════════════════════════════════════

describe('ajouterMoisIso', () => {
  it('renvoie toujours une date nue bien formée AAAA-MM-JJ', () => {
    // ORACLE : la fonction produit une date nue destinée à être comparée en
    // string et relue par `composantes` — le format est donc contractuel.
    fc.assert(
      fc.property(arbDateIso, fc.integer({ min: -240, max: 240 }), (d, n) => {
        const r = ajouterMoisIso(d, n)
        expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        const [a, m, j] = comp(r ?? '')
        // ORACLE : mois dans 1..12, jour dans 1..(jours du mois).
        expect(m).toBeGreaterThanOrEqual(1)
        expect(m).toBeLessThanOrEqual(12)
        expect(j).toBeGreaterThanOrEqual(1)
        expect(j).toBeLessThanOrEqual(joursDansMois(a, m))
      }),
      PARAMS,
    )
  })

  it('coïncide avec l’oracle calendaire quand aucun rabotage n’est possible', () => {
    // ORACLE : pour un quantième ≤ 28, tous les mois ont ce jour → le résultat
    // est le même quantième dans le mois cible, sans ambiguïté possible.
    fc.assert(
      fc.property(
        fc.integer({ min: 1990, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 }),
        fc.integer({ min: -240, max: 240 }),
        (a, m, j, n) => {
          const d = iso(a, m, j)
          expect(ajouterMoisIso(d, n)).toBe(ajouterMoisOracle(d, n))
        },
      ),
      PARAMS,
    )
  })

  it('est strictement croissante en nombre de mois', () => {
    // ORACLE : ajouter un mois de plus avance forcément d'au moins 28 jours.
    fc.assert(
      fc.property(
        arbDateIso,
        fc.integer({ min: -120, max: 120 }),
        fc.integer({ min: 1, max: 120 }),
        (d, n, pas) => {
          const a = ajouterMoisIso(d, n)
          const b = ajouterMoisIso(d, n + pas)
          expect(a).not.toBeNull()
          expect(b).not.toBeNull()
          expect(String(b) > String(a)).toBe(true)
        },
      ),
      PARAMS,
    )
  })

  it('renvoie null sur une entrée qui n’est pas une date nue', () => {
    // ORACLE : le contrat de la fonction (« Null si l'entrée est invalide »).
    for (const mauvaise of ['', 'pas une date', '2026-1-1', '20260101']) {
      expect(ajouterMoisIso(mauvaise, 1)).toBeNull()
    }
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('rabote sur la fin du mois cible (31/01 + 1 mois = 28/02)', () => {
    // RÉGRESSION COUVERTE : `new Date(a, m + n, j)` laissait DÉBORDER le
    // quantième sur le mois suivant — le 31 janvier + 1 mois devenait le
    // 3 mars. `ajouterMoisIso` rabote désormais sur le dernier jour du mois
    // cible, ce qui fixe l'échéance de reconduction, la fenêtre de préavis et
    // le rang de cycle de tout contrat ancré en fin de mois.
    // ORACLE : règle de quantième à quantième avec rabotage (PostgreSQL,
    // date-fns, droit français).
    expect(ajouterMoisIso('2026-01-31', 1)).toBe('2026-02-28')
    expect(ajouterMoisIso('2024-01-31', 1)).toBe('2024-02-29') // année bissextile
    expect(ajouterMoisIso('2026-03-31', -1)).toBe('2026-02-28')
    expect(ajouterMoisIso('2024-02-29', 12)).toBe('2025-02-28')
    expect(ajouterMoisIso('2026-04-30', 1)).toBe('2026-05-30') // cas SAIN (témoin)
    expect(ajouterMoisIso('2026-05-31', 1)).toBe('2026-06-30')
    expect(ajouterMoisIso('2026-08-31', 1)).toBe('2026-09-30')
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('rabote pour chaque décalage de 1 à 24 mois depuis une fin de mois', () => {
    // RÉGRESSION COUVERTE : le débordement de quantième faisait sortir la date
    // du mois cible pour tout ancrage de fin de mois. Balayage EXHAUSTIF (pas
    // aléatoire) de n = 1..24 sur les douze mois de 2026 (année commune) et
    // 2024 (bissextile) — 576 combinaisons.
    // ORACLE : depuis le dernier jour d'un mois, la reconduction n mois plus
    // tard tombe au plus tard le dernier jour du mois cible — jamais dans le
    // mois d'après.
    for (const annee of [2024, 2026]) {
      for (let mois = 1; mois <= 12; mois++) {
        const depart = iso(annee, mois, joursDansMois(annee, mois))
        for (let n = 1; n <= 24; n++) {
          expect(ajouterMoisIso(depart, n)).toBe(ajouterMoisOracle(depart, n))
        }
      }
    }
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('suit l’oracle calendaire pour toute date et tout décalage', () => {
    // RÉGRESSION COUVERTE (version propriété du débordement de quantième) :
    // fast-check cherche le plus petit contre-exemple sur l'ensemble du
    // domaine, toute date de 1990 à 2100 et tout décalage de ±20 ans.
    fc.assert(
      fc.property(arbDateIso, fc.integer({ min: -240, max: 240 }), (d, n) => {
        expect(ajouterMoisIso(d, n)).toBe(ajouterMoisOracle(d, n))
      }),
      PARAMS,
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// ajouterJoursIso
// ═════════════════════════════════════════════════════════════════════════════

describe('ajouterJoursIso', () => {
  it('coïncide avec l’oracle UTC (aucune dérive de changement d’heure)', () => {
    // ORACLE : n jours calendaires = n × 86 400 000 ms en UTC. Le code passe
    // par `new Date(a, m, j + n)` (heure locale) : les deux doivent coïncider,
    // y compris en traversant les passages heure d'été / heure d'hiver.
    fc.assert(
      fc.property(arbDateIso, fc.integer({ min: -4000, max: 4000 }), (d, n) => {
        expect(ajouterJoursIso(d, n)).toBe(ajouterJoursOracle(d, n))
      }),
      PARAMS,
    )
  })

  it('+1 jour avance d’exactement un jour calendaire', () => {
    // ORACLE : le lendemain est j+1, sauf le dernier jour du mois (→ 1er du
    // mois suivant) et le 31/12 (→ 1er janvier de l'année suivante).
    fc.assert(
      fc.property(arbDateIso, (d) => {
        const [a, m, j] = comp(d)
        const attendu =
          j < joursDansMois(a, m)
            ? iso(a, m, j + 1)
            : m < 12
              ? iso(a, m + 1, 1)
              : iso(a + 1, 1, 1)
        expect(ajouterJoursIso(d, 1)).toBe(attendu)
      }),
      PARAMS,
    )
  })

  it('compose : (d + a) + b = d + (a + b)', () => {
    // ORACLE : l'addition de jours est un groupe commutatif ; deux décalages
    // successifs équivalent à leur somme, signes quelconques.
    fc.assert(
      fc.property(
        arbDateIso,
        fc.integer({ min: -2000, max: 2000 }),
        fc.integer({ min: -2000, max: 2000 }),
        (d, a, b) => {
          const deuxTemps = ajouterJoursIso(String(ajouterJoursIso(d, a)), b)
          expect(deuxTemps).toBe(ajouterJoursIso(d, a + b))
        },
      ),
      PARAMS,
    )
  })

  it('est strictement croissante en nombre de jours', () => {
    // ORACLE : le temps ne recule pas — d + n < d + n + p pour p ≥ 1.
    fc.assert(
      fc.property(
        arbDateIso,
        fc.integer({ min: -2000, max: 2000 }),
        fc.integer({ min: 1, max: 2000 }),
        (d, n, pas) => {
          expect(
            String(ajouterJoursIso(d, n + pas)) > String(ajouterJoursIso(d, n)),
          ).toBe(true)
        },
      ),
      PARAMS,
    )
  })

  it('renvoie null sur une entrée qui n’est pas une date nue', () => {
    // ORACLE : contrat de la fonction.
    for (const mauvaise of ['', 'pas une date', '2026-1-1']) {
      expect(ajouterJoursIso(mauvaise, 1)).toBeNull()
    }
  })

  it('ne jette jamais et reste bien formée sur une date inexistante', () => {
    // ORACLE de robustesse : `2026-02-30` passe le filtre de forme du code ;
    // le résultat doit au minimum rester une date nue exploitable.
    // (Le code la normalise en 2026-03-02 — glissement documenté, non bloquant
    // puisque PostgreSQL n'émet jamais une telle date.)
    expect(ajouterJoursIso('2026-02-30', 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// etatContrat
// ═════════════════════════════════════════════════════════════════════════════

describe('etatContrat', () => {
  it('classe selon les bornes : à venir / actif / terminé', () => {
    // ORACLE : documentation de la fonction — « à venir » si le début est dans
    // le futur, « terminé » si la fin est passée, « actif » sinon. Les bornes
    // (jour du début, jour de la fin) appartiennent à la période ACTIVE.
    const jour = new Date(2026, 5, 15) // 15/06/2026, heure locale
    expect(etatContrat('2026-07-01', null, jour).etat).toBe('a_venir')
    expect(etatContrat('2026-06-15', null, jour).etat).toBe('actif') // borne début
    expect(etatContrat('2026-01-01', '2026-06-15', jour).etat).toBe('actif') // borne fin
    expect(etatContrat('2026-01-01', '2026-06-14', jour).etat).toBe('termine')
    expect(etatContrat('2026-01-01', null, jour).etat).toBe('actif')
  })

  it('renvoie toujours un état parmi les trois, avec libellé et variante', () => {
    // ORACLE : totalité — la fonction alimente un badge, elle ne peut pas ne
    // rien renvoyer, même sur des dates aberrantes.
    fc.assert(
      fc.property(arbDateChaotique, fc.option(arbDateChaotique), (d, f) => {
        const r = etatContrat(d, f, new Date(2026, 5, 15))
        expect(['a_venir', 'actif', 'termine']).toContain(r.etat)
        expect(r.label.length).toBeGreaterThan(0)
      }),
      PARAMS,
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// prochaineEcheanceContrat
// ═════════════════════════════════════════════════════════════════════════════

describe('prochaineEcheanceContrat', () => {
  it('déterminé → la date de fin, indéterminé → aucune échéance', () => {
    // ORACLE : documentation — déterminé (1) : `date_fin` ; indéterminé (3) :
    // pas d'échéance.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const det = prochaineEcheanceContrat(
          { ...c, type_contrat_id: TYPE_CONTRAT.determine },
          auj,
        )
        expect(det).toEqual({ type: 'fin', date: c.date_fin })
        const ind = prochaineEcheanceContrat(
          { ...c, type_contrat_id: TYPE_CONTRAT.indetermine },
          auj,
        )
        expect(ind).toEqual({ type: 'aucune', date: null })
      }),
      PARAMS,
    )
  })

  it('tacite : l’échéance est STRICTEMENT postérieure à aujourd’hui', () => {
    // ORACLE : « prochaine » échéance — une reconduction déjà passée n'est pas
    // la prochaine. Vrai pour toute ancienneté raisonnable (1990-2100).
    fc.assert(
      fc.property(
        arbDateIso,
        fc.integer({ min: 1, max: 60 }),
        arbDateIso,
        (debut, cycle, auj) => {
          const r = prochaineEcheanceContrat(
            {
              ...CONTRAT_BASE,
              type_contrat_id: TYPE_CONTRAT.tacite,
              date_debut: debut,
              duree_cycle_mois: cycle,
            },
            auj,
          )
          expect(r.type).toBe('reconduction')
          expect(r.date).not.toBeNull()
          expect(String(r.date) > auj).toBe(true)
        },
      ),
      PARAMS,
    )
  })

  it('tacite : l’échéance est la PLUS PETITE occurrence début + k×cycle (k ≥ 1)', () => {
    // ORACLE : définition de la reconduction tacite — minimalité. On vérifie la
    // structure avec l'arithmétique du code lui-même (le rabotage est un bug
    // distinct, testé plus haut) : l'occurrence précédente doit être ≤ aujourd'hui.
    fc.assert(
      fc.property(
        arbDateIso,
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 0, max: 4000 }),
        (debut, cycle, decalage) => {
          const auj = ajouterJoursOracle(debut, decalage)
          const r = prochaineEcheanceContrat(
            {
              ...CONTRAT_BASE,
              type_contrat_id: TYPE_CONTRAT.tacite,
              date_debut: debut,
              duree_cycle_mois: cycle,
            },
            auj,
          )
          // Reconstruction indépendante du rang k.
          let k = 1
          while (k < 500 && String(ajouterMoisIso(debut, cycle * k)) <= auj) {
            k += 1
          }
          expect(r.date).toBe(ajouterMoisIso(debut, cycle * k))
        },
      ),
      PARAMS,
    )
  })

  it('tacite sans cycle exploitable → pas de date', () => {
    // ORACLE : sans durée de cycle (nulle, zéro ou négative) aucune date de
    // reconduction ne peut être calculée.
    for (const cycle of [null, 0, -1, -12]) {
      const r = prochaineEcheanceContrat(
        { ...CONTRAT_BASE, duree_cycle_mois: cycle },
        '2026-06-15',
      )
      expect(r).toEqual({ type: 'reconduction', date: null })
    }
  })

  it('termine même sur un ancrage très éloigné (garde-fou 10 000 itérations)', () => {
    // ORACLE : terminaison — la boucle est bornée, l'appel doit rendre la main.
    // 1900 → 2026 = 1 512 reconductions mensuelles, sous la garde.
    const depart = Date.now()
    const r = prochaineEcheanceContrat(
      {
        ...CONTRAT_BASE,
        date_debut: '1900-01-01',
        duree_cycle_mois: 1,
      },
      '2026-09-16',
    )
    expect(Date.now() - depart).toBeLessThan(2000)
    // ORACLE : 1er du mois, reconduction mensuelle → la prochaine est le 1er
    // octobre 2026 (la reconduction du 1er septembre 2026 est déjà passée).
    expect(r.date).toBe('2026-10-01')
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('ne renvoie jamais une échéance DÉJÀ PASSÉE quand la garde est atteinte', () => {
    // RÉGRESSION COUVERTE : la garde à 10 000 itérations sortait de la boucle
    // sans distinguer « trouvé » de « abandonné » et rendait alors début +
    // 10 000 × cycle, soit ici le 1er mai 1833 — une échéance vieille de
    // 193 ans, renvoyée SILENCIEUSEMENT et affichée telle quelle. La fonction
    // rend désormais `null` quand la garde a coupé le calcul.
    // ORACLE : une « prochaine échéance » est par définition future.
    const r = prochaineEcheanceContrat(
      {
        ...CONTRAT_BASE,
        date_debut: '1000-01-01',
        duree_cycle_mois: 1,
      },
      '2026-09-16',
    )
    expect(r.date === null || r.date > '2026-09-16').toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// fenetrePreavisContrat
// ═════════════════════════════════════════════════════════════════════════════

describe('fenetrePreavisContrat', () => {
  it('la fin de fenêtre vaut exactement échéance − préavis', () => {
    // ORACLE : documentation — « Dernier jour pour résilier : échéance − préavis ».
    // Comparé à l'oracle UTC, pas à l'arithmétique du code.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const echeance = prochaineEcheanceContrat(c, auj).date
        const f = fenetrePreavisContrat(c, auj)
        if (!echeance || !/^\d{4}-\d{2}-\d{2}$/.test(echeance)) {
          expect(f.fin).toBeNull()
          return
        }
        expect(f.fin).toBe(ajouterJoursOracle(echeance, -c.delai_preavis_jours))
      }),
      PARAMS,
    )
  })

  it('le début de fenêtre n’est jamais après sa fin', () => {
    // ORACLE : un intervalle [debut ; fin] non vide — la fenêtre s'ouvre
    // `fenetre_resiliation_jours` (positif, cf. schemas.ts) AVANT sa fin.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const f = fenetrePreavisContrat(c, auj)
        if (f.debut == null || f.fin == null) return
        expect(f.debut <= f.fin).toBe(true)
      }),
      PARAMS,
    )
  })

  it('« ouverte » équivaut à debut ≤ aujourd’hui ≤ fin', () => {
    // ORACLE : documentation — `ouverte` est vrai si aujourd'hui ∈ [debut ; fin].
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const f = fenetrePreavisContrat(c, auj)
        const attendu =
          f.debut != null && f.fin != null && auj >= f.debut && auj <= f.fin
        expect(f.ouverte).toBe(attendu)
      }),
      PARAMS,
    )
  })

  it('sans fenêtre de résiliation : ouverture inconnue et fenêtre FERMÉE', () => {
    // ORACLE : choix conservateur documenté — sans `fenetre_resiliation_jours`,
    // on n'affirme pas que la résiliation est possible aujourd'hui.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const f = fenetrePreavisContrat(
          { ...c, fenetre_resiliation_jours: null },
          auj,
        )
        expect(f.debut).toBeNull()
        expect(f.ouverte).toBe(false)
      }),
      PARAMS,
    )
  })

  it('sans échéance (indéterminé) : fenêtre entièrement nulle', () => {
    // ORACLE : pas d'échéance → aucune date de préavis calculable.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const f = fenetrePreavisContrat(
          { ...c, type_contrat_id: TYPE_CONTRAT.indetermine },
          auj,
        )
        expect(f).toEqual({ ouverte: false, debut: null, fin: null })
      }),
      PARAMS,
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// resiliationDeclaree / evenementsContrat
// ═════════════════════════════════════════════════════════════════════════════

describe('resiliationDeclaree', () => {
  it('vrai si et seulement si une date de résiliation est renseignée', () => {
    // ORACLE : définition — la résiliation est déclarée dès que la date existe,
    // même future (résiliation notifiée d'avance) ; une chaîne vide ne compte pas.
    fc.assert(
      fc.property(arbContratChaotique, (c) => {
        expect(resiliationDeclaree(c)).toBe(
          c.date_resiliation != null && c.date_resiliation !== '',
        )
      }),
      PARAMS,
    )
  })
})

describe('evenementsContrat', () => {
  it('trie chronologiquement, sans date inconnue ni type dupliqué', () => {
    // ORACLE : la frise se lit de gauche à droite dans l'ordre du temps ; chaque
    // événement du contrat est unique (une seule signature, une seule échéance…)
    // et n'apparaît que si sa date est connue.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const evts = evenementsContrat(c, auj)
        const types = evts.map((e) => e.type)
        expect(new Set(types).size).toBe(types.length)
        for (const e of evts) {
          expect(e.date).toBeTruthy()
          expect(e.label.length).toBeGreaterThan(0)
        }
        for (let i = 1; i < evts.length; i++) {
          expect(String(evts[i - 1]?.date) <= String(evts[i]?.date)).toBe(true)
        }
      }),
      PARAMS,
    )
  })

  it('reprend exactement les dates du contrat pour signature/début/résiliation', () => {
    // ORACLE : ces trois événements sont des colonnes brutes, aucun calcul.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const evts = evenementsContrat(c, auj)
        const dateDe = (t: string) => evts.find((e) => e.type === t)?.date
        expect(dateDe('signature')).toBe(c.date_signature ?? undefined)
        expect(dateDe('debut')).toBe(c.date_debut)
        expect(dateDe('resiliation')).toBe(c.date_resiliation ?? undefined)
      }),
      PARAMS,
    )
  })

  it('ne jette jamais sur un contrat incohérent', () => {
    // ORACLE : totalité.
    fc.assert(
      fc.property(arbContratChaotique, arbDateIso, (c, auj) => {
        expect(Array.isArray(evenementsContrat(c, auj))).toBe(true)
      }),
      PARAMS,
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// statutContrat
// ═════════════════════════════════════════════════════════════════════════════

const STATUTS = ['archive', 'resilie', 'a_venir', 'expire', 'actif']

describe('statutContrat', () => {
  it('renvoie toujours EXACTEMENT un statut, même sur un contrat incohérent', () => {
    // ORACLE : totalité et exclusivité — la cascade se termine sur un `return`
    // inconditionnel ; jamais d'`undefined`, jamais de throw, libellé toujours
    // affichable.
    fc.assert(
      fc.property(arbContratChaotique, arbDateChaotique, (c, auj) => {
        const r = statutContrat(c, auj)
        expect(STATUTS).toContain(r.statut)
        expect(r.label.length).toBeGreaterThan(0)
        expect(r.tone).toBeTruthy()
      }),
      PARAMS,
    )
  })

  it('respecte la priorité archivé > résilié > à venir > expiré > actif', () => {
    // ORACLE : cascade documentée (D2). Matrice EXHAUSTIVE des 16 combinaisons
    // de drapeaux : ajouter un drapeau plus prioritaire écrase les autres.
    const auj = '2026-06-15'
    for (const archive of [false, true]) {
      for (const resilie of [false, true]) {
        for (const aVenir of [false, true]) {
          for (const expire of [false, true]) {
            const c: DonneesContrat = {
              ...CONTRAT_BASE,
              type_contrat_id: TYPE_CONTRAT.determine,
              est_archive: archive,
              date_resiliation: resilie ? '2026-01-10' : null,
              date_debut: aVenir ? '2027-01-01' : '2020-01-01',
              date_fin: expire ? '2021-01-01' : '2030-01-01',
            }
            const attendu = archive
              ? 'archive'
              : resilie
                ? 'resilie'
                : aVenir
                  ? 'a_venir'
                  : expire
                    ? 'expire'
                    : 'actif'
            expect(statutContrat(c, auj).statut).toBe(attendu)
          }
        }
      }
    }
  })

  it('une résiliation FUTURE ne rend pas le contrat « résilié »', () => {
    // ORACLE : tant que la date de résiliation n'est pas atteinte, le contrat
    // court encore ; il est actif avec le sous-statut « Résiliation notifiée ».
    const c: DonneesContrat = {
      ...CONTRAT_BASE,
      type_contrat_id: TYPE_CONTRAT.indetermine,
      date_debut: '2020-01-01',
      date_resiliation: '2026-12-31',
    }
    const r = statutContrat(c, '2026-06-15')
    expect(r.statut).toBe('actif')
    expect(r.sousStatut).toBe('Résiliation notifiée')
  })

  it('un sous-statut n’existe que pour un contrat actif', () => {
    // ORACLE : le sous-statut précise l'état d'un contrat EN COURS (préavis,
    // imminence) — il n'a aucun sens sur un contrat archivé, résilié ou expiré.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const r = statutContrat(c, auj)
        if (r.statut !== 'actif') expect(r.sousStatut).toBeUndefined()
      }),
      PARAMS,
    )
  })

  it('signale l’imminence d’une échéance sous 45 jours', () => {
    // ORACLE : seuil D2 (SEUIL_ALERTE_WARNING_JOURS = 45 jours).
    const c: DonneesContrat = {
      ...CONTRAT_BASE,
      type_contrat_id: TYPE_CONTRAT.determine,
      date_debut: '2020-01-01',
      date_fin: '2026-07-20',
      fenetre_resiliation_jours: null,
    }
    expect(statutContrat(c, '2026-06-15').sousStatut).toBe('Échéance proche') // 35 j
    expect(statutContrat(c, '2026-05-01').sousStatut).toBeUndefined() // 80 j
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// progressionContrat
// ═════════════════════════════════════════════════════════════════════════════

describe('progressionContrat', () => {
  it('reste dans [0 ; 1] ou vaut null', () => {
    // ORACLE : c'est une fraction de période, consommée par une barre de
    // progression (`ProgressBar`) : hors de [0 ; 1] la barre déborde.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const p = progressionContrat(c, auj)
        if (p === null) return
        expect(Number.isFinite(p)).toBe(true)
        expect(p).toBeGreaterThanOrEqual(0)
        expect(p).toBeLessThanOrEqual(1)
      }),
      PARAMS,
    )
  })

  it('vaut null pour un contrat archivé ou sans échéance', () => {
    // ORACLE : documentation — null si indéterminé (aucune échéance) ou archivé.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        expect(progressionContrat({ ...c, est_archive: true }, auj)).toBeNull()
        expect(
          progressionContrat(
            {
              ...c,
              est_archive: false,
              type_contrat_id: TYPE_CONTRAT.indetermine,
            },
            auj,
          ),
        ).toBeNull()
      }),
      PARAMS,
    )
  })

  it('croît avec la date du jour sur [début ; échéance] (durée déterminée)', () => {
    // ORACLE : le temps écoulé ne décroît pas et la période est fixe pour un
    // contrat à durée déterminée → la progression est monotone croissante.
    fc.assert(
      fc.property(
        arbDateIso,
        fc.integer({ min: 1, max: 3650 }),
        fc.integer({ min: 0, max: 3650 }),
        fc.integer({ min: 0, max: 3650 }),
        (debut, duree, o1, o2) => {
          const c: DonneesContrat = {
            ...CONTRAT_BASE,
            type_contrat_id: TYPE_CONTRAT.determine,
            est_archive: false,
            date_debut: debut,
            date_fin: ajouterJoursOracle(debut, duree),
          }
          const t1 = ajouterJoursOracle(debut, Math.min(o1, o2, duree))
          const t2 = ajouterJoursOracle(
            debut,
            Math.min(Math.max(o1, o2), duree),
          )
          const p1 = progressionContrat(c, t1)
          const p2 = progressionContrat(c, t2)
          expect(p1).not.toBeNull()
          expect(Number(p2)).toBeGreaterThanOrEqual(Number(p1))
        },
      ),
      PARAMS,
    )
  })

  it('vaut 0 au premier jour et 1 au jour de l’échéance (durée déterminée)', () => {
    // ORACLE : bornes de la fraction — rien d'écoulé au début, tout à la fin.
    const c: DonneesContrat = {
      ...CONTRAT_BASE,
      type_contrat_id: TYPE_CONTRAT.determine,
      est_archive: false,
      date_debut: '2026-01-01',
      date_fin: '2026-12-31',
    }
    expect(progressionContrat(c, '2026-01-01')).toBe(0)
    expect(progressionContrat(c, '2026-12-31')).toBe(1)
    // Milieu : 181 jours écoulés sur 364 → ≈ 0,497.
    expect(progressionContrat(c, '2026-07-01')).toBeCloseTo(181 / 364, 6)
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('ne renvoie jamais NaN sur une date de début illisible', () => {
    // RÉGRESSION COUVERTE : `joursEntre` propageait NaN sans filtre jusqu'au
    // résultat, alors que `total <= 0` et `Math.min/max` laissent NaN passer.
    // La fonction écarte désormais les écarts non finis et rend `null`.
    // ORACLE : le résultat alimente `width: ${p*100}%` ; NaN casse le rendu au
    // lieu de masquer la barre — la cascade ne sait dire « incalculable »
    // qu'avec null.
    const p = progressionContrat(
      {
        ...CONTRAT_BASE,
        type_contrat_id: TYPE_CONTRAT.determine,
        est_archive: false,
        date_debut: 'pas une date',
        date_fin: '2026-12-31',
      },
      '2026-06-15',
    )
    expect(p === null || Number.isFinite(p)).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// alerteContrat
// ═════════════════════════════════════════════════════════════════════════════

describe('alerteContrat', () => {
  it('applique les seuils 15 / 45 jours, bornes incluses', () => {
    // ORACLE : seuils D2 — `destructive` jusqu'à 15 jours INCLUS, `warning`
    // jusqu'à 45 jours INCLUS, rien au-delà ; balayage exhaustif de −3 à 60 j.
    const debut = '2026-01-01'
    const auj = '2026-06-15'
    for (let n = -3; n <= 60; n++) {
      const c: DonneesContrat = {
        ...CONTRAT_BASE,
        type_contrat_id: TYPE_CONTRAT.determine,
        est_archive: false,
        date_debut: debut,
        date_fin: ajouterJoursOracle(auj, n),
      }
      const a = alerteContrat(c, auj)
      if (n < 0) {
        expect(a).toBeNull()
      } else if (n <= SEUIL_ALERTE_DANGER_JOURS) {
        expect(a?.tone).toBe('destructive')
      } else if (n <= SEUIL_ALERTE_WARNING_JOURS) {
        expect(a?.tone).toBe('warning')
      } else {
        expect(a).toBeNull()
      }
    }
  })

  it('libelle le nombre exact de jours restants', () => {
    // ORACLE : écart en jours calendaires (oracle UTC) entre aujourd'hui et
    // l'échéance ; « aujourd'hui » quand l'écart est nul.
    const auj = '2026-06-15'
    for (const n of [0, 1, 7, 15, 30, 45]) {
      const fin = ajouterJoursOracle(auj, n)
      const c: DonneesContrat = {
        ...CONTRAT_BASE,
        type_contrat_id: TYPE_CONTRAT.determine,
        est_archive: false,
        date_debut: '2026-01-01',
        date_fin: fin,
      }
      const attendu =
        n === 0
          ? "Échéance aujourd'hui"
          : `Échéance dans ${String(ecartJoursOracle(fin, auj))} j`
      expect(alerteContrat(c, auj)?.message).toBe(attendu)
    }
  })

  it('parle de « Reconduction » pour un contrat tacite', () => {
    // ORACLE : le vocabulaire suit le type d'échéance (reconduction ≠ fin).
    const c: DonneesContrat = {
      ...CONTRAT_BASE,
      type_contrat_id: TYPE_CONTRAT.tacite,
      est_archive: false,
      date_debut: '2020-07-01',
      duree_cycle_mois: 12,
    }
    expect(alerteContrat(c, '2026-06-15')?.message).toBe(
      'Reconduction dans 16 j',
    )
  })

  it('se tait pour un contrat archivé ou déjà résilié', () => {
    // ORACLE : plus rien à anticiper sur un contrat qui n'est plus actif.
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        expect(alerteContrat({ ...c, est_archive: true }, auj)).toBeNull()
        expect(
          alerteContrat(
            { ...c, est_archive: false, date_resiliation: '1990-01-01' },
            auj,
          ),
        ).toBeNull()
      }),
      PARAMS,
    )
  })

  it('ne jette jamais et reste cohérente sur un contrat incohérent', () => {
    // ORACLE : totalité — et si une alerte est produite, sa tonalité fait
    // partie des tonalités connues.
    fc.assert(
      fc.property(arbContratChaotique, arbDateIso, (c, auj) => {
        const a = alerteContrat(c, auj)
        if (a) expect(['destructive', 'warning']).toContain(a.tone)
      }),
      PARAMS,
    )
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// nbAvenantsDirects
// ═════════════════════════════════════════════════════════════════════════════

/** Jeu de contrats ACYCLIQUE : le parent est toujours un nœud d'indice inférieur. */
const arbForet = fc
  .array(fc.option(fc.nat({ max: 40 }), { nil: null }), {
    minLength: 1,
    maxLength: 40,
  })
  .map((parents) =>
    parents.map((p, i) => ({
      id: `c${String(i)}`,
      contrat_parent_id: p == null || p >= i ? null : `c${String(p)}`,
      date_debut: iso(2000 + (i % 25), 1 + (i % 12), 1 + (i % 28)),
    })),
  )

describe('nbAvenantsDirects', () => {
  it('conserve le cardinal : Σ(avenants directs) = nombre de contrats ayant un parent', () => {
    // ORACLE : conservation — chaque contrat ayant un parent EXISTANT est
    // compté une fois et une seule, dans les enfants de ce parent.
    // (La formulation « racines + Σ(avenants des racines) = total » n'est vraie
    // que pour une forêt de profondeur 1 ; elle est testée telle quelle
    // ci-dessous. La version générale est celle-ci.)
    fc.assert(
      fc.property(arbForet, (tous) => {
        const ids = new Set(tous.map((c) => c.id))
        const somme = tous.reduce(
          (acc, c) => acc + nbAvenantsDirects(tous, c.id),
          0,
        )
        const avecParent = tous.filter(
          (c) => c.contrat_parent_id != null && ids.has(c.contrat_parent_id),
        ).length
        expect(somme).toBe(avecParent)
      }),
      PARAMS,
    )
  })

  it('forêt de profondeur 1 : racines + Σ(avenants des racines) = total', () => {
    // ORACLE : dans une forêt où aucun avenant n'est lui-même avenanté, tout
    // contrat est soit une racine, soit l'enfant direct d'une racine.
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 6 }), { minLength: 1, maxLength: 7 }),
        (enfantsParRacine) => {
          const tous: NoeudVersion[] = []
          enfantsParRacine.forEach((n, i) => {
            const racine = `r${String(i)}`
            tous.push({
              id: racine,
              contrat_parent_id: null,
              date_debut: '2020-01-01',
            })
            for (let k = 0; k < n; k++) {
              tous.push({
                id: `${racine}-a${String(k)}`,
                contrat_parent_id: racine,
                date_debut: '2021-01-01',
              })
            }
          })
          const racines = tous.filter((c) => c.contrat_parent_id === null)
          const somme = racines.reduce(
            (acc, r) => acc + nbAvenantsDirects(tous, r.id),
            0,
          )
          expect(racines.length + somme).toBe(tous.length)
        },
      ),
      PARAMS,
    )
  })

  it('ne compte que les enfants DIRECTS, jamais les petits-enfants', () => {
    // ORACLE : définition — « avenants directs (enfants) ».
    const tous: NoeudVersion[] = [
      { id: 'A', contrat_parent_id: null, date_debut: '2020-01-01' },
      { id: 'B', contrat_parent_id: 'A', date_debut: '2021-01-01' },
      { id: 'C', contrat_parent_id: 'B', date_debut: '2022-01-01' },
    ]
    expect(nbAvenantsDirects(tous, 'A')).toBe(1)
    expect(nbAvenantsDirects(tous, 'C')).toBe(0)
    expect(nbAvenantsDirects(tous, 'inconnu')).toBe(0)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// chaineDeVersions
// ═════════════════════════════════════════════════════════════════════════════

/** Chaîne linéaire de `n` contrats : c0 → c1 → … → c(n−1). */
function chaineLineaire(n: number): NoeudVersion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${String(i)}`,
    contrat_parent_id: i === 0 ? null : `c${String(i - 1)}`,
    date_debut: ajouterJoursOracle('2000-01-01', i * 30),
  }))
}

describe('chaineDeVersions', () => {
  it('reconstruit une chaîne de 500 avenants, de la racine à la feuille', () => {
    // ORACLE : la chaîne est linéaire et chronologique (racine d'abord) ; elle
    // contient exactement les 500 versions, chacune une fois.
    const tous = chaineLineaire(500)
    const chaine = chaineDeVersions(tous, 'c250')
    expect(chaine.map((c) => c.id)).toEqual(tous.map((c) => c.id))
    expect(new Set(chaine.map((c) => c.id)).size).toBe(500)
  })

  it('renvoie [] si la cible est absente', () => {
    // ORACLE : documentation de la fonction.
    expect(chaineDeVersions(chaineLineaire(5), 'inconnu')).toEqual([])
    expect(chaineDeVersions([], 'c0')).toEqual([])
  })

  it('termine et ne répète jamais un contrat, même sur un graphe CYCLIQUE', () => {
    // ORACLE : terminaison garantie — les garde-fous `remonte`/`vus` bornent les
    // deux boucles ; un cycle de parenté (donnée corrompue) ne doit ni figer
    // l'écran ni dupliquer une version.
    const cas: NoeudVersion[][] = [
      // auto-référence
      [{ id: 'A', contrat_parent_id: 'A', date_debut: '2020-01-01' }],
      // cycle à 2
      [
        { id: 'A', contrat_parent_id: 'B', date_debut: '2020-01-01' },
        { id: 'B', contrat_parent_id: 'A', date_debut: '2021-01-01' },
      ],
      // cycle à 3
      [
        { id: 'A', contrat_parent_id: 'C', date_debut: '2020-01-01' },
        { id: 'B', contrat_parent_id: 'A', date_debut: '2021-01-01' },
        { id: 'C', contrat_parent_id: 'B', date_debut: '2022-01-01' },
      ],
      // longue chaîne refermée sur elle-même
      chaineLineaire(200).map((c, i, t) =>
        i === 0 ? { ...c, contrat_parent_id: t[t.length - 1]?.id ?? null } : c,
      ),
    ]
    for (const tous of cas) {
      for (const cible of tous) {
        const depart = Date.now()
        const chaine = chaineDeVersions(tous, cible.id)
        expect(Date.now() - depart).toBeLessThan(1000)
        const ids = chaine.map((c) => c.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) {
          expect(tous.some((c) => c.id === id)).toBe(true)
        }
      }
    }
  })

  it('termine sur n’importe quel graphe de parenté aléatoire', () => {
    // ORACLE : totalité — le parent peut pointer n'importe quel contrat (ou un
    // identifiant inconnu) ; la fonction doit toujours rendre la main, sans
    // doublon, et n'inventer aucun contrat.
    const arbGraphe = fc
      .array(fc.option(fc.nat({ max: 15 }), { nil: null }), {
        minLength: 1,
        maxLength: 16,
      })
      .map((parents) =>
        parents.map((p, i) => ({
          id: `c${String(i)}`,
          contrat_parent_id:
            p == null || p >= parents.length ? null : `c${String(p)}`,
          date_debut: iso(2000 + (i % 25), 1 + (i % 12), 1 + (i % 28)),
        })),
      )
    fc.assert(
      fc.property(arbGraphe, fc.nat({ max: 15 }), (tous, k) => {
        const cible = tous[k % tous.length]?.id ?? 'c0'
        const chaine = chaineDeVersions(tous, cible)
        const ids = chaine.map((c) => c.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const id of ids) expect(tous.some((c) => c.id === id)).toBe(true)
      }),
      PARAMS,
    )
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('contient toujours la version demandée', () => {
    // RÉGRESSION COUVERTE : la descente ne suit que l'enfant le PLUS ANCIEN ;
    // dès qu'un parent porte deux avenants (donnée corrompue ou trigger
    // `archive_contrat_parent` contourné), l'autre branche disparaissait et la
    // chaîne rendue — ['R', 'A'] — n'incluait pas sa propre cible. Un filet en
    // fin de fonction retombe désormais sur la cible seule.
    // ORACLE : « chaîne des versions à laquelle appartient cibleId » — la cible
    // en fait partie par définition (sinon la fonction renvoie []).
    const tous: NoeudVersion[] = [
      { id: 'R', contrat_parent_id: null, date_debut: '2020-01-01' },
      { id: 'A', contrat_parent_id: 'R', date_debut: '2021-01-01' },
      { id: 'B', contrat_parent_id: 'R', date_debut: '2022-01-01' },
    ]
    expect(chaineDeVersions(tous, 'B').map((c) => c.id)).toContain('B')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// texteContrat
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ORACLE du rang de cycle : rang du cycle courant = 1 + nombre de reconductions
 * DÉJÀ passées, comptées en mois calendaires (jamais en « 30,44 jours »).
 */
function rangCycleOracle(debut: string, cycle: number, auj: string): number {
  let k = 1
  while (k < 5000 && ajouterMoisOracle(debut, cycle * k) <= auj) k += 1
  return k
}

describe('texteContrat', () => {
  it('produit toujours une phrase française non vide', () => {
    // ORACLE : totalité — le texte est affiché tel quel sur la carte contrat.
    fc.assert(
      fc.property(arbContratChaotique, arbDateIso, (c, auj) => {
        const t = texteContrat(c, auj)
        expect(typeof t).toBe('string')
        expect(t.trim().length).toBeGreaterThan(0)
        expect(t.trimEnd().endsWith('.')).toBe(true)
      }),
      PARAMS,
    )
  })

  it('suit la cascade archivé → résilié → à venir', () => {
    // ORACLE : cascade documentée (doc #16), priorité décroissante.
    const auj = '2026-06-15'
    const archive = { ...CONTRAT_BASE, est_archive: true }
    expect(texteContrat(archive, auj)).toBe(
      "Ce contrat est archivé et n'est plus actif.",
    )
    const resilie = {
      ...CONTRAT_BASE,
      est_archive: false,
      date_resiliation: '2026-03-01',
    }
    expect(texteContrat(resilie, auj)).toContain('a été résilié le 1 mars 2026')
    const aVenir = {
      ...CONTRAT_BASE,
      est_archive: false,
      date_debut: '2026-09-01',
    }
    expect(texteContrat(aVenir, auj)).toContain(
      'Il entrera en vigueur le 1 septembre 2026',
    )
  })

  it('annonce la cessation au terme du préavis après notification', () => {
    // ORACLE : cessation = notification + délai de préavis (oracle UTC).
    const c: DonneesContrat = {
      ...CONTRAT_BASE,
      est_archive: false,
      date_debut: '2020-01-01',
      date_notification: '2026-06-01',
      delai_preavis_jours: 90,
    }
    // 01/06/2026 + 90 j = 30/08/2026.
    expect(ajouterJoursOracle('2026-06-01', 90)).toBe('2026-08-30')
    expect(texteContrat(c, '2026-06-15')).toContain(
      'La cessation est prévue le 30 août 2026',
    )
  })

  it('ne parle jamais de reconduction pour un contrat à durée déterminée', () => {
    // ORACLE : le doc #16 réserve la reconduction au type tacite (2).
    fc.assert(
      fc.property(arbContratValide, arbDateIso, (c, auj) => {
        const t = texteContrat(
          {
            ...c,
            est_archive: false,
            type_contrat_id: TYPE_CONTRAT.determine,
            date_resiliation: null,
            date_notification: null,
          },
          auj,
        )
        expect(t.toLowerCase()).not.toContain('se renouvelle automatiquement')
      }),
      PARAMS,
    )
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('n’invite jamais à résilier « à tout moment » un contrat à fenêtre', () => {
    // RÉGRESSION COUVERTE : le rang du cycle était calculé avec l'approximation
    // « cycle × 30,44 jours ». Au 01/03, ce contrat mensuel était réputé dans
    // son 2e cycle — fini le 28/02, donc DÉJÀ passé — au lieu du 3e ; la fin de
    // cycle tombait dans le passé et la phrase basculait sur « Vous pouvez le
    // résilier à tout moment en respectant un préavis de 30 jours. » On
    // annonçait à l'exploitant qu'il pouvait résilier quand il voulait, alors
    // que le contrat n'est résiliable que dans une fenêtre. Le rang se compte
    // désormais en mois calendaires.
    // ORACLE : le cycle COURANT contient aujourd'hui, donc sa date de fin est
    // ≥ aujourd'hui ; avec une fenêtre de résiliation définie, on est forcément
    // avant ou dans cette fenêtre.
    const c: DonneesContrat = {
      ...CONTRAT_BASE,
      est_archive: false,
      type_contrat_id: TYPE_CONTRAT.tacite,
      date_debut: '2025-01-01',
      duree_cycle_mois: 1,
      fenetre_resiliation_jours: 30,
    }
    expect(texteContrat(c, '2025-03-01')).not.toContain('à tout moment')
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('annonce le bon rang de cycle (compté en mois calendaires)', () => {
    // RÉGRESSION COUVERTE (version propriété de la même famille) : le rang
    // valait `floor(jours écoulés / (cycle × 30,44)) + 1`, une approximation qui
    // décroche des mois réels — pour un cycle de 12 mois, 12 × 30,44 = 365,28
    // alors qu'une année commune fait 365 jours. Le rang affiché est désormais
    // celui du décompte calendaire, sur tout le domaine.
    fc.assert(
      fc.property(
        arbDateIso,
        fc.integer({ min: 1, max: 24 }),
        fc.integer({ min: 0, max: 3650 }),
        (debut, cycle, decalage) => {
          const auj = ajouterJoursOracle(debut, decalage)
          const t = texteContrat(
            {
              ...CONTRAT_BASE,
              est_archive: false,
              type_contrat_id: TYPE_CONTRAT.tacite,
              date_debut: debut,
              duree_cycle_mois: cycle,
              date_resiliation: null,
              date_notification: null,
              date_fin: null,
            },
            auj,
          )
          const m = /son (\d+)(?:er|e) cycle/.exec(t)
          expect(m).not.toBeNull()
          expect(Number(m?.[1])).toBe(rangCycleOracle(debut, cycle, auj))
        },
      ),
      PARAMS,
    )
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('n’affiche jamais « NaN » ni « undefined » à l’utilisateur', () => {
    // RÉGRESSION COUVERTE : `formatDuree(NaN)` remontait jusqu'à l'écran —
    // « Ce contrat est en attente d'activation. Il entrera en vigueur le —,
    // soit dans NaN an. » `formatDuree` écarte désormais les écarts non finis
    // et dit « une durée indéterminée », comme `fmtLong` dit « date non
    // définie ».
    // ORACLE : le texte est lu tel quel par un exploitant ; aucun marqueur
    // technique n'y a sa place.
    const t = texteContrat(
      {
        ...CONTRAT_BASE,
        est_archive: false,
        type_contrat_id: TYPE_CONTRAT.indetermine,
        date_debut: 'pas une date',
      },
      '2026-06-15',
    )
    expect(t).not.toContain('NaN')
    expect(t).not.toContain('undefined')
  })
})
// ═════════════════════════════════════════════════════════════════════════════
// DURCISSEMENT — campagne de mutation
// Les blocs ci-dessous visent les altérations du code que la suite ci-dessus ne
// distinguait pas (mutants survivants). Même règle : chaque test cite l'oracle
// calendaire ou métier qui justifie son attendu, recalculé indépendamment.
// ═════════════════════════════════════════════════════════════════════════════

/** Contrat à durée déterminée, actif, sans résiliation ni notification. */
function contratDetermine(
  date_debut: string,
  date_fin: string | null,
  extra: Partial<DonneesContrat> = {},
): DonneesContrat {
  return {
    ...CONTRAT_BASE,
    type_contrat_id: TYPE_CONTRAT.determine,
    est_archive: false,
    date_debut,
    date_fin,
    date_signature: null,
    date_resiliation: null,
    date_notification: null,
    duree_cycle_mois: null,
    ...extra,
  }
}

/** Contrat à tacite reconduction, actif, sans résiliation ni notification. */
function contratTacite(
  date_debut: string,
  duree_cycle_mois: number | null,
  extra: Partial<DonneesContrat> = {},
): DonneesContrat {
  return {
    ...CONTRAT_BASE,
    type_contrat_id: TYPE_CONTRAT.tacite,
    est_archive: false,
    date_debut,
    date_fin: null,
    date_signature: null,
    date_resiliation: null,
    date_notification: null,
    duree_cycle_mois,
    ...extra,
  }
}

describe('etatContrat — variante de badge', () => {
  it('donne à chaque état une variante connue et DISTINCTE', () => {
    // ORACLE : `variant` est passé tel quel au Badge, qui ne connaît que
    // 'default' | 'secondary' | 'outline' (type `EtatContratInfo`) — toute autre
    // valeur donne un badge sans style. Et les trois états doivent rester
    // visuellement distinguables : deux variantes identiques feraient se
    // ressembler « à venir » et « terminé » sur la carte prestataire.
    const jour = new Date(2026, 5, 15) // 15/06/2026, heure locale
    const aVenir = etatContrat('2026-07-01', null, jour)
    const actif = etatContrat('2026-01-01', null, jour)
    const termine = etatContrat('2026-01-01', '2026-06-14', jour)
    for (const r of [aVenir, actif, termine]) {
      expect(['default', 'secondary', 'outline']).toContain(r.variant)
    }
    expect(new Set([aVenir.variant, actif.variant, termine.variant]).size).toBe(
      3,
    )
  })
})

describe('ajouterMoisIso / ajouterJoursIso — forme stricte de la date nue', () => {
  it('refuse une date nue noyée dans une autre chaîne', () => {
    // ORACLE : une date nue fait EXACTEMENT dix caractères, du premier au
    // dernier. Ni un préfixe (« le 2026-01-15 »), ni un suffixe
    // (« 2026-01-15T10:00:00 », forme d'un timestamp Postgres), ni une espace
    // parasite ne sont des dates nues : le contrat de la fonction est de rendre
    // null dès que la forme n'est pas respectée de bout en bout. Sans ses deux
    // ancres, un timestamp serait silencieusement tronqué à sa partie date.
    expect(ajouterMoisIso('le 2026-01-15', 1)).toBeNull()
    expect(ajouterMoisIso('2026-01-15T10:00:00', 1)).toBeNull()
    expect(ajouterJoursIso(' 2026-01-15', 1)).toBeNull()
    expect(ajouterJoursIso('2026-01-15 ', 1)).toBeNull()
  })
})

describe('prochaineEcheanceContrat — garde-fou d’itérations', () => {
  it('calcule jusqu’à 10 000 reconductions, puis renonce', () => {
    // ORACLE : le garde-fou du code plafonne le nombre de reconductions
    // calculées à 10 000 — c'est lui qui garantit que l'appel rend la main sur
    // un ancrage aberrant. 1000-01-01 + 10 000 mois = mois n° 12 000 + 10 000
    // = 22 000 → année 1833 (22 000 / 12 = 1833, reste 4), mois 5. La borne se
    // lit à un jour près, de part et d'autre de cette 10 000e reconduction.
    expect(ajouterMoisOracle('1000-01-01', 10_000)).toBe('1833-05-01')
    const vieux = {
      ...CONTRAT_BASE,
      date_debut: '1000-01-01',
      duree_cycle_mois: 1,
    }
    // Sous la borne : la 10 000e reconduction est encore future, on la rend.
    expect(prochaineEcheanceContrat(vieux, '1833-04-15').date).toBe(
      '1833-05-01',
    )
    // À la borne : le calcul est abandonné — et un abandon ne se déguise pas
    // en échéance passée (cf. « ne renvoie jamais une échéance DÉJÀ PASSÉE »).
    expect(prochaineEcheanceContrat(vieux, '1833-05-01').date).toBeNull()
  })
})

describe('fenetrePreavisContrat — bornes calendaires exactes', () => {
  // Contrat déterminé : échéance 31/12/2026, préavis 30 j, fenêtre 15 j.
  // ORACLE (recalculé à la main) :
  //   fin   = 31/12/2026 − 30 j = 01/12/2026 (décembre a 31 jours)
  //   début = 01/12/2026 − 15 j = 16/11/2026 (novembre a 30 jours)
  const c = contratDetermine('2020-01-01', '2026-12-31', {
    delai_preavis_jours: 30,
    fenetre_resiliation_jours: 15,
  })

  it('pose le début et la fin de fenêtre aux dates exactes', () => {
    const f = fenetrePreavisContrat(c, '2026-06-15')
    expect(f.fin).toBe('2026-12-01')
    expect(f.debut).toBe('2026-11-16')
  })

  it('ouvre la fenêtre sur [début ; fin], bornes INCLUSES', () => {
    // ORACLE : le premier et le dernier jour de la fenêtre sont des jours où la
    // résiliation peut encore être notifiée — les exclure priverait
    // l'exploitant de deux jours sur quinze ; la veille du premier jour, la
    // fenêtre n'est pas encore ouverte.
    expect(fenetrePreavisContrat(c, '2026-11-15').ouverte).toBe(false)
    expect(fenetrePreavisContrat(c, '2026-11-16').ouverte).toBe(true)
    expect(fenetrePreavisContrat(c, '2026-11-25').ouverte).toBe(true)
    expect(fenetrePreavisContrat(c, '2026-12-01').ouverte).toBe(true)
    expect(fenetrePreavisContrat(c, '2026-12-02').ouverte).toBe(false)
  })
})

describe('evenementsContrat — types et libellé d’échéance', () => {
  it('nomme chaque événement par son type canonique', () => {
    // ORACLE : `type` est la clef technique lue par la frise (icône, ancrage,
    // couleur) ; le jeu est fixé par `TypeEvenementContrat`. Un type vide ou
    // renommé rendrait l'événement inaffichable. Contrat instrumenté pour que
    // les SEPT événements soient datés.
    const c = contratDetermine('2026-01-01', '2026-12-31', {
      date_signature: '2025-12-01',
      date_notification: '2026-11-01',
      date_resiliation: '2026-12-15',
      delai_preavis_jours: 30,
      fenetre_resiliation_jours: 15,
    })
    expect(
      new Set(evenementsContrat(c, '2026-06-15').map((e) => e.type)),
    ).toEqual(
      new Set([
        'signature',
        'debut',
        'preavis_debut',
        'preavis_fin',
        'notification',
        'echeance',
        'resiliation',
      ]),
    )
  })

  it('libelle l’échéance selon le type de contrat', () => {
    // ORACLE : vocabulaire métier — un contrat tacite se RECONDUIT, un contrat
    // à durée déterminée prend FIN. Confondre les deux ferait croire à
    // l'exploitant qu'un contrat s'arrête alors qu'il repart pour un cycle.
    const labelEcheance = (c: DonneesContrat) =>
      evenementsContrat(c, '2026-06-15').find((e) => e.type === 'echeance')
        ?.label
    expect(labelEcheance(contratTacite('2020-01-01', 12))).toBe('Reconduction')
    expect(labelEcheance(contratDetermine('2020-01-01', '2026-12-31'))).toBe(
      'Fin du contrat',
    )
  })
})

describe('statutContrat — sous-statut du contrat actif', () => {
  it('signale le préavis ouvert AVANT de parler d’imminence', () => {
    // ORACLE : dans la fenêtre de préavis, l'information actionnable est « c'est
    // maintenant qu'il faut notifier » — elle prime sur le simple constat que
    // l'échéance approche. Fenêtre : 16/11 → 01/12/2026 (cf. bloc ci-dessus) ;
    // au 20/11 l'échéance est à 41 jours, donc dans le seuil d'imminence : sans
    // la priorité au préavis, on lirait « Échéance proche ».
    const c = contratDetermine('2020-01-01', '2026-12-31', {
      delai_preavis_jours: 30,
      fenetre_resiliation_jours: 15,
    })
    expect(statutContrat(c, '2026-11-20').sousStatut).toBe('Préavis ouvert')
  })

  it('signale l’imminence sur [0 ; 45] jours, bornes incluses', () => {
    // ORACLE : seuil D2 (SEUIL_ALERTE_WARNING_JOURS = 45 jours) ; le JOUR MÊME
    // de l'échéance (écart nul) est le cas le plus urgent — l'exclure serait
    // absurde — et à 46 jours il n'y a plus rien à signaler.
    // Pas de fenêtre de résiliation ici, pour isoler le sous-statut d'imminence.
    const auj = '2026-06-15'
    const c = (fin: string) =>
      contratDetermine('2020-01-01', fin, { fenetre_resiliation_jours: null })
    expect(statutContrat(c(auj), auj).sousStatut).toBe('Échéance proche')
    expect(
      statutContrat(c(ajouterJoursOracle(auj, SEUIL_ALERTE_WARNING_JOURS)), auj)
        .sousStatut,
    ).toBe('Échéance proche')
    expect(
      statutContrat(
        c(ajouterJoursOracle(auj, SEUIL_ALERTE_WARNING_JOURS + 1)),
        auj,
      ).sousStatut,
    ).toBeUndefined()
  })

  it('parle de reconduction imminente sur un contrat tacite', () => {
    // ORACLE : vocabulaire métier (cf. evenementsContrat). Contrat annuel
    // démarré le 01/07/2020 : la reconduction du 01/07/2026 tombe 16 jours
    // après le 15/06/2026 (15 jours de juin, puis le 1er juillet).
    const c = contratTacite('2020-07-01', 12, {
      fenetre_resiliation_jours: null,
    })
    expect(statutContrat(c, '2026-06-15').sousStatut).toBe(
      'Reconduction imminente',
    )
  })

  it('n’annonce pas d’imminence pour une échéance située dans le PASSÉ', () => {
    // ORACLE : « imminent » signifie à venir sous 45 jours ; un écart NÉGATIF
    // n'est pas une imminence. Sur un contrat tacite très ancien, le garde-fou
    // des 10 000 itérations renonce à calculer l'échéance : le sous-statut doit
    // rester vide plutôt que d'annoncer une reconduction pour demain.
    const c = contratTacite('1000-01-01', 1, {
      fenetre_resiliation_jours: null,
    })
    expect(statutContrat(c, '2026-09-16').sousStatut).toBeUndefined()
  })
})

describe('statutContrat — bornes de la cascade', () => {
  it('le jour de la résiliation, le contrat est DÉJÀ résilié', () => {
    // ORACLE : la résiliation prend effet le jour dit ; au 15/06 un contrat
    // résilié le 15/06 n'est plus en service.
    const c = contratTacite('2020-01-01', 12, {
      date_resiliation: '2026-06-15',
    })
    expect(statutContrat(c, '2026-06-15').statut).toBe('resilie')
  })

  it('le jour du début, le contrat est actif (et non « à venir »)', () => {
    // ORACLE : la date de début est le PREMIER jour d'exécution du contrat,
    // borne incluse — même convention que `etatContrat`.
    expect(
      statutContrat(contratTacite('2026-06-15', 12), '2026-06-15').statut,
    ).toBe('actif')
  })

  it('une date de fin ne fait pas expirer un contrat TACITE', () => {
    // ORACLE : sur un contrat à tacite reconduction, la date de fin n'est pas
    // une échéance ferme — l'échéance d'un tacite est sa prochaine reconduction
    // (cf. `prochaineEcheanceContrat`). Le faire expirer afficherait « Expiré »
    // sur un contrat qui court toujours et se facture toujours.
    const c = contratTacite('2020-01-01', 12, { date_fin: '2021-01-01' })
    expect(statutContrat(c, '2026-06-15').statut).toBe('actif')
  })
})

describe('progressionContrat — période courante et durée nulle', () => {
  it('mesure la progression DANS le cycle courant, pas depuis l’origine', () => {
    // ORACLE : contrat tacite annuel démarré le 01/01/2020. Au 15/06/2026, le
    // cycle courant va du 01/01/2026 (dernière reconduction) au 01/01/2027
    // (prochaine), soit 365 jours ; il s'est écoulé 165 jours depuis le
    // 01/01/2026 (31 + 28 + 31 + 30 + 31 = 151 jours jusqu'au 1er juin, + 14).
    // Compter depuis 2020 donnerait ~92 % : on afficherait un contrat « presque
    // fini » alors qu'il vient de se reconduire pour un an.
    expect(
      progressionContrat(contratTacite('2020-01-01', 12), '2026-06-15'),
    ).toBeCloseTo(165 / 365, 6)
  })

  it('vaut 1 pour une période de durée nulle', () => {
    // ORACLE : un contrat qui commence et finit le même jour est intégralement
    // consommé. 0 / 0 n'est pas une fraction affichable : la barre de
    // progression attend un nombre de [0 ; 1], NaN casse son rendu.
    expect(
      progressionContrat(
        contratDetermine('2026-06-15', '2026-06-15'),
        '2026-06-15',
      ),
    ).toBe(1)
  })
})

describe('chaineDeVersions — parent hors périmètre et fratrie', () => {
  it('ne casse pas quand le parent référencé est absent du jeu', () => {
    // ORACLE : `tous` est filtré par la RLS — un contrat parent peut être hors
    // périmètre (autre site) et donc absent de la liste, alors que la colonne
    // `contrat_parent_id` le référence toujours. La remontée doit s'arrêter sur
    // le contrat lui-même, jamais déréférencer un contrat introuvable.
    const tous: NoeudVersion[] = [
      {
        id: 'A',
        contrat_parent_id: 'HORS-PERIMETRE',
        date_debut: '2021-01-01',
      },
    ]
    expect(chaineDeVersions(tous, 'A').map((c) => c.id)).toEqual(['A'])
  })

  it('descend par l’avenant le PLUS ANCIEN, quel que soit l’ordre de la liste', () => {
    // ORACLE : la chaîne est chronologique (« le plus ancien d'abord »). L'ordre
    // du tableau vient de la requête Supabase et n'est pas garanti : il ne doit
    // pas décider de la version retenue — ici le plus récent est listé en
    // premier, et c'est bien le plus ancien qui doit suivre la racine.
    const tous: NoeudVersion[] = [
      { id: 'R', contrat_parent_id: null, date_debut: '2020-01-01' },
      { id: 'TARD', contrat_parent_id: 'R', date_debut: '2022-01-01' },
      { id: 'TOT', contrat_parent_id: 'R', date_debut: '2021-01-01' },
    ]
    expect(chaineDeVersions(tous, 'R').map((c) => c.id)).toEqual(['R', 'TOT'])
  })
})

describe('texteContrat — durée d’activité en toutes lettres', () => {
  /**
   * Durée affichée par la branche « terminé » pour un contrat qui a duré
   * EXACTEMENT `nbJours` jours : les dates sont posées par l'oracle UTC, on lit
   * le segment « après … d'activité » de la phrase rendue.
   */
  function dureeApres(nbJours: number, debut = '2020-01-01'): string {
    const fin = ajouterJoursOracle(debut, nbJours)
    const t = texteContrat(
      contratDetermine(debut, fin),
      ajouterJoursOracle(fin, 1),
    )
    return /après (.+) d'activité/.exec(t)?.[1] ?? t
  }

  it('compte en jours en deçà d’un mois', () => {
    // ORACLE : en dessous du mois on parle en jours entiers ; le pluriel
    // apparaît à partir de 2 ; une durée nulle n'est pas « 0 jour ».
    expect(dureeApres(0)).toBe("moins d'un jour")
    expect(dureeApres(1)).toBe('1 jour')
    expect(dureeApres(2)).toBe('2 jours')
    expect(dureeApres(29)).toBe('29 jours')
  })

  it('bascule en mois à partir de 30 jours', () => {
    // ORACLE : un mois moyen vaut 365,25 / 12 = 30,44 jours (approximation
    // assumée et documentée). 30 j → 1 mois (30 / 30,44 = 0,99) ; 61 j →
    // 2 mois (2,00) ; 334 j → 11 mois (10,97).
    expect(dureeApres(30)).toBe('1 mois')
    expect(dureeApres(61)).toBe('2 mois')
    expect(dureeApres(334)).toBe('11 mois')
  })

  it('bascule en années pour une année complète, avec le bon pluriel', () => {
    // ORACLE : du 01/01/2024 au 01/01/2025 il y a 366 jours (2024 est
    // bissextile) → « 1 an », au SINGULIER. Du 01/01/2024 au 01/01/2026 :
    // 366 + 365 = 731 jours → « 2 ans », au PLURIEL. Aucun mois résiduel à
    // mentionner dans les deux cas : l'année est ronde.
    expect(dureeApres(366, '2024-01-01')).toBe('1 an')
    expect(dureeApres(731, '2024-01-01')).toBe('2 ans')
  })

  it('ajoute les mois restants quand l’année n’est pas ronde', () => {
    // ORACLE : 500 jours = 1 année (365,25 j) + 134,75 j, soit 4,43 mois de
    // 30,44 jours → « 1 an et 4 mois ».
    expect(dureeApres(500, '2024-01-01')).toBe('1 an et 4 mois')
  })

  // ── RÉGRESSION COUVERTE ────────────────────────────────────────────────────
  it('dit « 1 an » pour une année commune complète (365 jours)', () => {
    // RÉGRESSION COUVERTE : `formatDuree` mêlait DEUX diviseurs en huit lignes.
    // moisTotal = round(365 / 30,44) = 12, donc `moisTotal < 12` était FAUX et
    // on basculait sur la branche « années » ; là ans = floor(365 / 365,25) = 0
    // et moisRestants = round(365 / 30,44) = 12 → « 0 an et 12 mois » sur la
    // carte contrat, pour le contrat annuel le plus banal de la GMAO. Même
    // famille : 730 jours (deux années communes) donnaient « 1 an et 12 mois »
    // au lieu de « 2 ans ». Les années sont désormais dérivées du MÊME
    // `moisTotal`, ce qui interdit structurellement un reste de 12 mois.
    // ORACLE : du 01/01/2025 au 01/01/2026 il s'est écoulé une année civile
    // complète — 365 jours, 2025 n'étant pas bissextile.
    expect(dureeApres(365, '2025-01-01')).toBe('1 an')
    expect(dureeApres(730, '2025-01-01')).toBe('2 ans')
  })
})

describe('texteContrat — branches de la cascade', () => {
  it('le jour du début, le contrat n’est plus « à venir »', () => {
    // ORACLE : borne incluse — le contrat prend effet le jour de sa date de
    // début (même convention que statutContrat et etatContrat).
    expect(
      texteContrat(contratTacite('2026-06-15', null), '2026-06-15'),
    ).not.toContain('entrera en vigueur')
  })

  it('cite la signature si elle existe, annonce l’attente sinon', () => {
    // ORACLE : doc #16 — un contrat signé mais pas encore en vigueur se dit
    // « signé le … » ; sans date de signature on ne peut qu'annoncer l'attente
    // d'activation. Dans les deux cas l'entrée en vigueur est datée.
    const base = contratDetermine('2026-09-01', '2027-08-31')
    const avec = texteContrat(
      { ...base, date_signature: '2026-06-01' },
      '2026-06-15',
    )
    expect(avec).toContain('Ce contrat a été signé le 1 juin 2026.')
    expect(avec).toContain('Il entrera en vigueur le 1 septembre 2026')
    expect(texteContrat(base, '2026-06-15')).toContain(
      "Ce contrat est en attente d'activation.",
    )
  })

  it('n’écrit « arrivé à échéance » qu’au lendemain de l’échéance', () => {
    // ORACLE : borne de fin INCLUSE (cf. statutContrat) — le jour de l'échéance
    // le contrat est encore actif ; le passé composé ne vaut qu'à partir du
    // lendemain.
    const c = contratDetermine('2020-01-01', '2026-06-15')
    expect(texteContrat(c, '2026-06-15')).toContain('est actif depuis')
    expect(texteContrat(c, '2026-06-16')).toContain(
      'Ce contrat est arrivé à échéance le 15 juin 2026',
    )
  })

  it('décrit un contrat déterminé encore courant comme actif', () => {
    // ORACLE : une date de fin FUTURE décrit un contrat en cours, pas un
    // contrat terminé — « arrivé à échéance » est réservé au passé.
    const t = texteContrat(
      contratDetermine('2020-01-01', '2030-01-01'),
      '2026-06-15',
    )
    expect(t).toContain('Ce contrat à durée déterminée est actif depuis')
    expect(t).not.toContain('arrivé à échéance')
  })

  it('distingue durée déterminée et durée indéterminée', () => {
    // ORACLE : doc #16 — le TYPE du contrat pilote la phrase, pas la présence
    // d'une date de fin. Un indéterminé se résilie à tout moment moyennant
    // préavis ; lui annoncer une échéance ferme serait faux.
    const ind = texteContrat(
      {
        ...contratDetermine('2020-01-01', '2030-01-01'),
        type_contrat_id: TYPE_CONTRAT.indetermine,
      },
      '2026-06-15',
    )
    expect(ind).toContain('Ce contrat à durée indéterminée est actif depuis')
    expect(ind).toContain(
      'Il peut être résilié à tout moment en respectant un préavis de 30 jours.',
    )
  })

  it('gradue le conseil de fin selon l’échéance restante (30 j / 90 j)', () => {
    // ORACLE : doc #16 — trois paliers pour un contrat à durée déterminée : le
    // dernier mois (≤ 30 j) est « imminent », le trimestre (≤ 90 j) invite à
    // anticiper, au-delà on renvoie au renouvellement manuel. Bornes INCLUSES :
    // à 30 jours pile on est encore dans le dernier mois, à 90 jours pile
    // encore dans le trimestre.
    const auj = '2026-06-15'
    const phrase = (n: number) =>
      texteContrat(
        contratDetermine('2020-01-01', ajouterJoursOracle(auj, n)),
        auj,
      )
    expect(phrase(30)).toContain(
      "L'échéance est imminente et il n'y a pas de reconduction automatique.",
    )
    expect(phrase(31)).toContain(
      'Sans reconduction automatique, pensez à anticiper le renouvellement.',
    )
    expect(phrase(90)).toContain(
      'Sans reconduction automatique, pensez à anticiper le renouvellement.',
    )
    expect(phrase(91)).toContain(
      "Aucune reconduction automatique n'est prévue, il faudra renouveler manuellement si nécessaire.",
    )
  })

  it('dit « date non définie » plutôt que de laisser un trou dans la phrase', () => {
    // ORACLE : la phrase est lue telle quelle par l'exploitant. Quand la date
    // de cessation n'est pas calculable — ici parce que la date de notification
    // n'est pas une date nue (import hérité au format français) — la phrase
    // doit rester une phrase complète, pas « La cessation est prévue le , au
    // terme… ».
    const c = contratTacite('2020-01-01', 12, {
      date_notification: '15/06/2026',
    })
    expect(texteContrat(c, '2026-06-15')).toContain(
      'La cessation est prévue le date non définie',
    )
  })
})

describe('texteContrat — tacite reconduction', () => {
  it('décrit un tacite SANS cycle par son seul préavis', () => {
    // ORACLE : doc #16 (cas 8.A) — sans durée de cycle il n'y a ni rang de
    // cycle ni fenêtre de résiliation : on ne peut annoncer que le préavis.
    // Durée écoulée : du 01/01/2025 au 15/06/2025 = 165 jours, soit
    // round(165 / 30,44) = 5 mois.
    expect(
      texteContrat(
        contratTacite('2025-01-01', null, { delai_preavis_jours: 60 }),
        '2025-06-15',
      ),
    ).toBe(
      'Ce contrat fonctionne par tacite reconduction et est actif depuis 5 mois. Pour résilier, un préavis de 60 jours est nécessaire.',
    )
  })

  it('traite un cycle nul ou négatif comme une absence de cycle', () => {
    // ORACLE : robustesse — une durée de cycle ≤ 0 n'a aucun sens calendaire.
    // Elle ne doit produire ni « 0e cycle », ni division par zéro, ni date
    // invalide : on retombe sur la description souple (cas 8.A).
    for (const cycle of [0, -12]) {
      expect(
        texteContrat(contratTacite('2025-01-01', cycle), '2025-06-15'),
      ).toContain('Ce contrat fonctionne par tacite reconduction')
    }
  })

  it('annonce le rang du cycle courant et la fenêtre à venir', () => {
    // ORACLE : contrat annuel démarré le 01/01/2025 → 1er cycle du 01/01/2025
    // au 31/12/2025 (veille de la reconduction du 01/01/2026), 2e cycle du
    // 01/01/2026 au 31/12/2026. La fenêtre de 30 jours se referme avec le
    // cycle et s'ouvre 29 jours plus tôt : du 02/12 au 31/12 inclus.
    const c = contratTacite('2025-01-01', 12)
    const t1 = texteContrat(c, '2025-06-15')
    expect(t1).toContain(
      'Ce contrat se renouvelle automatiquement tous les 12 mois.',
    )
    expect(t1).toContain('entre dans son 1er cycle.')
    expect(t1).toContain(
      'Pour résilier, il faudra attendre la fenêtre du 2 décembre 2025 au 31 décembre 2025, avec un préavis de 30 jours.',
    )
    const t2 = texteContrat(c, '2026-06-15')
    expect(t2).toContain('entre dans son 2e cycle.')
    expect(t2).toContain(
      'Pour résilier, il faudra attendre la fenêtre du 2 décembre 2026 au 31 décembre 2026, avec un préavis de 30 jours.',
    )
  })

  it('annonce la fenêtre OUVERTE sur ses bornes, incluses', () => {
    // ORACLE : mêmes bornes que ci-dessus (02/12 → 31/12/2025). Le premier et
    // le dernier jour comptent : les exclure ferait rater la résiliation pour
    // un an. La veille, la fenêtre n'est pas encore ouverte.
    const c = contratTacite('2025-01-01', 12)
    const ouverture =
      'La fenêtre de résiliation est actuellement ouverte, du 2 décembre 2025 au 31 décembre 2025.'
    expect(texteContrat(c, '2025-12-01')).not.toContain('actuellement ouverte')
    expect(texteContrat(c, '2025-12-02')).toContain(ouverture)
    expect(texteContrat(c, '2025-12-20')).toContain(ouverture)
    expect(texteContrat(c, '2025-12-31')).toContain(ouverture)
  })

  it('sans fenêtre de résiliation, renvoie au seul préavis', () => {
    // ORACLE : doc #16 (cas 3 du complément) — aucune fenêtre définie ⇒ la
    // résiliation est possible à tout moment moyennant le préavis. Il ne doit
    // alors être question d'aucune fenêtre datée.
    const t = texteContrat(
      contratTacite('2025-01-01', 12, { fenetre_resiliation_jours: null }),
      '2025-06-15',
    )
    expect(t).toContain(
      'Vous pouvez le résilier à tout moment en respectant un préavis de 30 jours.',
    )
    expect(t).not.toContain('fenêtre')
  })
})
describe('alerteContrat — résiliation datée', () => {
  it('se tait le JOUR de la résiliation, alerte encore si elle est FUTURE', () => {
    // ORACLE : la documentation réserve le silence au contrat « déjà résilié ».
    // Une résiliation prend effet le jour dit : au 15/06, un contrat résilié le
    // 15/06 n'a plus d'échéance à anticiper. En revanche, tant qu'elle n'a pas
    // pris effet, le contrat court toujours : son échéance du 25/06 — dans
    // 10 jours — reste l'information à afficher (10 ≤ 15 → tonalité urgente).
    // La masquer dès qu'une résiliation est PROGRAMMÉE ferait disparaître le
    // seul repère d'échéance d'un contrat encore en service.
    const c = (resiliation: string) =>
      contratDetermine('2020-01-01', '2026-06-25', {
        date_resiliation: resiliation,
      })
    expect(alerteContrat(c('2026-06-15'), '2026-06-15')).toBeNull()
    const future = alerteContrat(c('2026-06-20'), '2026-06-15')
    expect(future?.message).toBe('Échéance dans 10 j')
    expect(future?.tone).toBe('destructive')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// NON-RÉGRESSION — les formes de contrat réellement présentes en base
// Les 18 contrats de production sont TOUS à cycle multiple de 12 mois : le mois
// cible d'une reconduction est donc toujours le mois d'ancrage, et le rabotage
// de `ajouterMoisIso` n'y a jamais rien à raboter. C'est ce qui rend la
// correction de l'arithmétique calendaire sans effet à l'écran — et ce bloc en
// est le filet : si une échéance, une fenêtre de préavis, une progression ou un
// statut bouge un jour sur ces formes-là, ce n'est pas un bug corrigé, c'est
// une régression introduite.
// Comme partout dans ce fichier, les attendus sont recalculés par les oracles
// indépendants du haut de fichier, jamais recopiés d'une sortie observée.
// ═════════════════════════════════════════════════════════════════════════════

/** Formes présentes en base : cycle 12 ou 36 mois, ancrage 1er ou milieu de mois. */
const CONTRATS_PRODUCTION: { nom: string; c: DonneesContrat }[] = [
  {
    nom: 'tacite 12 mois, ancrage 1er janvier',
    c: contratTacite('2022-01-01', 12, {
      delai_preavis_jours: 30,
      fenetre_resiliation_jours: 30,
    }),
  },
  {
    nom: 'tacite 12 mois, ancrage 1er juillet, préavis 90 j',
    c: contratTacite('2021-07-01', 12, {
      date_signature: '2021-06-15',
      delai_preavis_jours: 90,
      fenetre_resiliation_jours: 60,
    }),
  },
  {
    nom: 'tacite 12 mois, ancrage en milieu de mois',
    c: contratTacite('2023-05-15', 12, {
      delai_preavis_jours: 30,
      fenetre_resiliation_jours: 30,
    }),
  },
  {
    nom: 'tacite 36 mois, ancrage 1er avril',
    c: contratTacite('2020-04-01', 36, {
      delai_preavis_jours: 60,
      fenetre_resiliation_jours: 90,
    }),
  },
  {
    nom: 'tacite 24 mois, sans fenêtre de résiliation',
    c: contratTacite('2022-09-01', 24, { fenetre_resiliation_jours: null }),
  },
  {
    nom: 'déterminé, un an',
    c: contratDetermine('2025-01-01', '2026-01-01'),
  },
  {
    nom: 'déterminé, trois ans, échu',
    c: contratDetermine('2019-02-01', '2022-01-31'),
  },
  {
    nom: 'tacite 12 mois, résilié',
    c: contratTacite('2021-01-01', 12, {
      date_notification: '2024-03-01',
      date_resiliation: '2024-06-30',
    }),
  },
]

/** Journées d'observation : bords de cycle, anniversaires, milieu de période. */
const JOURS_OBSERVATION = [
  '2024-02-29',
  '2025-06-15',
  '2025-12-31',
  '2026-01-01',
  '2026-06-15',
  '2026-09-16',
  '2026-12-15',
  '2027-03-01',
]

describe('non-régression — arithmétique des contrats de production', () => {
  it('un cycle multiple de 12 mois retombe sur le mois ET le quantième d’ancrage', () => {
    // ORACLE : ajouter un multiple de 12 mois, c'est ajouter des années
    // entières — le mois cible EST le mois d'ancrage, donc le quantième y
    // existe et il n'y a rien à raboter. Seule exception calendaire : le
    // 29 février, absent des années communes. C'est exactement la raison pour
    // laquelle la correction du rabotage ne touche aucun contrat en base.
    fc.assert(
      fc.property(arbDateIso, fc.integer({ min: 1, max: 5 }), (d, n) => {
        const [a, m, j] = comp(d)
        const r = comp(String(ajouterMoisIso(d, 12 * n)))
        expect(r[0]).toBe(a + n)
        expect(r[1]).toBe(m)
        expect(r[2]).toBe(m === 2 && j === 29 && !estBissextile(a + n) ? 28 : j)
      }),
      PARAMS,
    )
  })

  it('pose l’échéance, la fenêtre de préavis et le statut aux dates de l’oracle', () => {
    // ORACLE, recalculé pour chaque forme et chaque jour d'observation :
    //  - tacite   : plus petite occurrence ancrage + k×cycle STRICTEMENT future
    //               (rang k reconstruit à la main par l'oracle calendaire) ;
    //  - déterminé: la date de fin, telle quelle ;
    //  - fenêtre  : [échéance − préavis − fenêtre ; échéance − préavis], en
    //               arithmétique UTC, ouverte bornes incluses ;
    //  - statut   : cascade archivé → résilié → à venir → expiré → actif.
    for (const { nom, c } of CONTRATS_PRODUCTION) {
      for (const auj of JOURS_OBSERVATION) {
        const contexte = `${nom} @ ${auj}`
        let echeance: string | null
        if (c.type_contrat_id === TYPE_CONTRAT.determine) {
          echeance = c.date_fin
        } else {
          let k = 1
          const cycle = c.duree_cycle_mois ?? 0
          while (k < 500 && ajouterMoisOracle(c.date_debut, cycle * k) <= auj) {
            k += 1
          }
          echeance = ajouterMoisOracle(c.date_debut, cycle * k)
        }
        expect(prochaineEcheanceContrat(c, auj).date, contexte).toBe(echeance)

        const fin =
          echeance == null
            ? null
            : ajouterJoursOracle(echeance, -c.delai_preavis_jours)
        const debut =
          fin == null || c.fenetre_resiliation_jours == null
            ? null
            : ajouterJoursOracle(fin, -c.fenetre_resiliation_jours)
        const f = fenetrePreavisContrat(c, auj)
        expect(f.fin, contexte).toBe(fin)
        expect(f.debut, contexte).toBe(debut)
        expect(f.ouverte, contexte).toBe(
          debut != null && fin != null && auj >= debut && auj <= fin,
        )

        const attendu =
          c.date_resiliation != null && c.date_resiliation <= auj
            ? 'resilie'
            : c.date_debut > auj
              ? 'a_venir'
              : c.type_contrat_id === TYPE_CONTRAT.determine &&
                  c.date_fin != null &&
                  c.date_fin < auj
                ? 'expire'
                : 'actif'
        expect(statutContrat(c, auj).statut, contexte).toBe(attendu)
      }
    }
  })

  it('mesure la progression dans le cycle courant, en jours calendaires', () => {
    // ORACLE : la période courante d'un tacite va de la reconduction précédente
    // (échéance − cycle) à l'échéance ; la fraction écoulée se compte en jours
    // calendaires (oracle UTC). Contrat annuel ancré au 01/01, lu le 15/06/2026 :
    // période 01/01/2026 → 01/01/2027 = 365 jours, 165 jours écoulés
    // (31 + 28 + 31 + 30 + 31 = 151 jusqu'au 1er juin, + 14).
    const annuel = contratTacite('2022-01-01', 12)
    expect(progressionContrat(annuel, '2026-06-15')).toBeCloseTo(165 / 365, 9)
    // Le jour de la reconduction, la période repart de zéro.
    expect(progressionContrat(annuel, '2026-01-01')).toBe(0)
    // Contrat triennal ancré au 01/04/2020 : cycle courant 01/04/2026 →
    // 01/04/2029, soit 1 096 jours (2028 bissextile) ; au 15/06/2026 il s'est
    // écoulé 75 jours (30 d'avril + 31 de mai + 14).
    const triennal = contratTacite('2020-04-01', 36, {
      delai_preavis_jours: 60,
      fenetre_resiliation_jours: 90,
    })
    expect(ecartJoursOracle('2029-04-01', '2026-04-01')).toBe(1096)
    expect(progressionContrat(triennal, '2026-06-15')).toBeCloseTo(75 / 1096, 9)
  })

  it('décrit la carte d’un contrat annuel mot pour mot', () => {
    // ORACLE : contrat annuel ancré au 01/01/2022, lu le 15/06/2026. Il est
    // dans son 5e cycle (quatre reconductions passées : 2023, 2024, 2025, 2026),
    // actif depuis 4 ans et 5 mois (1 626 jours → round(1 626 / 30,44) = 53 mois
    // = 4 ans et 5 mois), et sa fenêtre de 30 jours se referme la veille de la
    // reconduction du 01/01/2027, donc du 02/12 au 31/12/2026.
    expect(ecartJoursOracle('2026-06-15', '2022-01-01')).toBe(1626)
    expect(texteContrat(contratTacite('2022-01-01', 12), '2026-06-15')).toBe(
      'Ce contrat se renouvelle automatiquement tous les 12 mois. ' +
        'Il est actif depuis 4 ans et 5 mois et entre dans son 5e cycle. ' +
        'Pour résilier, il faudra attendre la fenêtre du 2 décembre 2026 ' +
        'au 31 décembre 2026, avec un préavis de 30 jours.',
    )
  })
})
