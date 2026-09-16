import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { STATUTS_DI_TERMINAUX } from '@/features/demandes/etat'
import { STATUTS_EVENEMENTS_TERMINAUX } from '@/features/evenements/etat'
import { STATUTS_TRAVAUX_TERMINAUX } from '@/features/travaux/etat'
import { diTitre } from '@/features/demandes/schemas'
import { segOfUnique } from '@/lib/slug'
import type {
  LigneActivite,
  RowDemande,
  RowEvenement,
  RowTravaux,
} from './activite'
import { lignesDemandes, lignesEvenements, lignesTravaux } from './activite'

/**
 * Propriétés (fast-check) de la normalisation des trois journaux du tableau de
 * bord — complément des tests par l'exemple de `activite.test.ts`.
 *
 * Ce que la carte « Activité » promet à l'utilisateur :
 *  - elle montre TOUT ce que la query lui a donné (rien n'est avalé) ;
 *  - ce qu'il reste à traiter est EN HAUT, dans l'ordre de récence de la query ;
 *  - un clic ouvre la BONNE fiche (slugs injectifs, hérités de `segOfUnique`).
 * Ce sont ces trois promesses que les propriétés ci-dessous encodent.
 */

const CFG = { numRuns: 1000, seed: 42 } as const

// ── Générateurs ───────────────────────────────────────────────────────────────

/**
 * Libellés volontairement PAUVRES en variété : beaucoup d'ex æquo, donc beaucoup
 * d'homonymes (→ désambiguïsation de slug) et beaucoup d'égalités de statut
 * (→ un tri instable se voit tout de suite).
 */
const libelle = fc.oneof(
  fc.constantFrom(
    '',
    '   ',
    '###',
    'Fuite',
    'fuite',
    'Fuite au sous-sol',
    'Porte bloquée',
    'Porte bloquee',
    '👨‍👩‍👧',
    'Ronde mensuelle\nligne suivante ignorée',
    `${'a'.repeat(100)} très long titre tronqué à 80`,
  ),
  fc.string(),
  fc.string({ unit: 'grapheme', maxLength: 30 }),
)

/** Dates telles qu'elles peuvent arriver : valides, nulles côté texte, ou abîmées. */
const dateTexte = fc.oneof(
  fc.constantFrom(
    '2026-09-10',
    '2026-01-01',
    '',
    '2026-02-30',
    'pas-une-date',
    'NaN',
  ),
  fc.string(),
)

const id = fc.uuid({ version: 4 })

/** Statuts : ceux du référentiel ET des identifiants inconnus (données historiques). */
const statutId = fc.integer({ min: 0, max: 6 })

const demandes = fc.uniqueArray(
  fc.record({
    id,
    constat: libelle,
    date_constat: dateTexte,
    statut_di_id: statutId,
  }),
  { selector: (r) => r.id, maxLength: 15 },
)

const travaux = fc.uniqueArray(
  fc.record({
    id,
    titre: libelle,
    date_demande: dateTexte,
    date_fin: fc.option(dateTexte, { nil: null }),
    statut_travaux_id: statutId,
  }),
  { selector: (r) => r.id, maxLength: 15 },
)

const evenements = fc.uniqueArray(
  fc.record({
    id,
    titre: libelle,
    date_evenement: dateTexte,
    date_cloture: fc.option(dateTexte, { nil: null }),
    statut_evenement_id: statutId,
  }),
  { selector: (r) => r.id, maxLength: 15 },
)

/** Référentiel id → nom, parfois incomplet voire vide (cache froid). */
const referentiel = fc
  .uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 7 })
  .map((ids) => new Map(ids.map((i) => [i, `Statut ${String(i)}`])))

// ── Outils d'assertion partagés ───────────────────────────────────────────────

function estCroissant(xs: number[]): boolean {
  return xs.every((x, i) => i === 0 || x > xs[i - 1]!)
}

/**
 * Les trois promesses, vérifiées sur n'importe quelle sortie.
 * `rangs` : index d'entrée de chaque ligne, pour juger de la stabilité du tri.
 */
function verifierLesTroisPromesses(
  lignes: LigneActivite[],
  idsEntree: string[],
): void {
  // 1. CONSERVATION DU CARDINAL — et même de l'ensemble des ids : la sortie est
  // une PERMUTATION de l'entrée, jamais un filtrage ni un doublonnage.
  expect(lignes).toHaveLength(idsEntree.length)
  expect([...lignes.map((l) => l.id)].sort()).toEqual([...idsEntree].sort())

  // 2. PARTITION + TRI STABLE — toutes les lignes non terminées d'abord, puis
  // les terminées ; à l'intérieur de chaque groupe, l'ordre d'entrée (récence
  // décidée par la query) est préservé → index d'entrée strictement croissants.
  const rang = new Map(idsEntree.map((x, i) => [x, i]))
  const premierTermine = lignes.findIndex((l) => l.termine)
  if (premierTermine !== -1) {
    expect(lignes.slice(premierTermine).every((l) => l.termine)).toBe(true)
  }
  expect(
    estCroissant(lignes.filter((l) => !l.termine).map((l) => rang.get(l.id)!)),
  ).toBe(true)
  expect(
    estCroissant(lignes.filter((l) => l.termine).map((l) => rang.get(l.id)!)),
  ).toBe(true)

  // 3. SLUGS INJECTIFS ET NON VIDES — un clic ouvre la bonne fiche, et aucun
  // segment ne s'évapore du chemin d'URL.
  const slugs = lignes.map((l) => l.slug)
  expect(new Set(slugs).size).toBe(slugs.length)
  expect(slugs.every((s) => s.length > 0)).toBe(true)
}

// ── Demandes d'intervention ───────────────────────────────────────────────────

describe('lignesDemandes — propriétés', () => {
  it('tient les trois promesses (cardinal, partition stable, slugs injectifs)', () => {
    // ORACLE : cf. `verifierLesTroisPromesses` — contrat annoncé par le module
    // (« ordre de récence préservé à l'intérieur de chaque groupe », « slug
    // unique parmi les frères, jamais l'UUID »).
    fc.assert(
      fc.property(demandes, (rows) => {
        verifierLesTroisPromesses(
          lignesDemandes(rows),
          rows.map((r) => r.id),
        )
      }),
      { numRuns: 2000, seed: 42 },
    )
  })

  it('`termine` dit exactement ce que dit le référentiel des statuts terminaux', () => {
    // ORACLE : la définition du champ (« Statut TERMINAL … sert au tri et au
    // choix de l'onglet »), confrontée à `STATUTS_DI_TERMINAUX`, source unique
    // de la feature Demandes.
    fc.assert(
      fc.property(demandes, (rows) => {
        const parId = new Map(rows.map((r) => [r.id, r]))
        for (const l of lignesDemandes(rows)) {
          const statut = parId.get(l.id)!.statut_di_id
          expect(l.termine).toBe(
            (STATUTS_DI_TERMINAUX as readonly number[]).includes(statut),
          )
        }
      }),
      CFG,
    )
  })

  it('titre = `diTitre(constat)`, et le slug se REDÉRIVE des titres affichés', () => {
    // ORACLE : le module annonce « Titre affiché ET base du slug (les deux
    // doivent coïncider) ». C'est la condition de symétrie : la page de détail
    // recalcule le segment depuis les mêmes couples (nom, id) ; si le slug était
    // dérivé d'autre chose que du titre montré, la résolution divergerait.
    fc.assert(
      fc.property(demandes, (rows) => {
        const lignes = lignesDemandes(rows)
        const sibs = lignes.map((l) => ({ nom: l.titre, id: l.id }))
        for (const l of lignes) {
          expect(l.slug).toBe(segOfUnique({ nom: l.titre, id: l.id }, sibs))
        }
        const parId = new Map(rows.map((r) => [r.id, r]))
        for (const l of lignes) {
          expect(l.titre).toBe(diTitre(parId.get(l.id)!.constat))
        }
      }),
      CFG,
    )
  })

  it('est TOTALE : ne jette jamais, quels que soient libellés, dates et statuts', () => {
    // ORACLE : les lignes viennent de la base (constats vides, dates
    // historiques abîmées, statuts hors référentiel après migration). Le tableau
    // de bord est la page d'accueil : il ne doit jamais tomber.
    fc.assert(
      fc.property(demandes, (rows) => {
        expect(Array.isArray(lignesDemandes(rows))).toBe(true)
      }),
      CFG,
    )
  })
})

// ── Travaux ───────────────────────────────────────────────────────────────────

describe('lignesTravaux — propriétés', () => {
  it('tient les trois promesses, quel que soit le référentiel fourni', () => {
    // ORACLE : identique aux demandes ; le référentiel (id → nom) ne sert qu'au
    // LIBELLÉ, il ne doit influencer ni le cardinal, ni l'ordre, ni les slugs.
    fc.assert(
      fc.property(travaux, referentiel, (rows, statuts) => {
        verifierLesTroisPromesses(
          lignesTravaux(rows, statuts),
          rows.map((r) => r.id),
        )
      }),
      { numRuns: 2000, seed: 42 },
    )
  })

  it('le référentiel n’influence QUE le libellé du statut', () => {
    // ORACLE : séparation des responsabilités annoncée (« Travaux et événements
    // tirent leur libellé de la base »). Un cache froid (Map vide) ne doit pas
    // réordonner la carte ni changer un lien.
    fc.assert(
      fc.property(travaux, referentiel, (rows, statuts) => {
        const avec = lignesTravaux(rows, statuts)
        const sans = lignesTravaux(rows, new Map<number, string>())
        expect(avec.map((l) => [l.id, l.slug, l.termine, l.sousTitre])).toEqual(
          sans.map((l) => [l.id, l.slug, l.termine, l.sousTitre]),
        )
      }),
      CFG,
    )
  })

  it('`termine` suit `STATUTS_TRAVAUX_TERMINAUX`', () => {
    // ORACLE : référentiel des statuts terminaux de la feature Travaux.
    fc.assert(
      fc.property(travaux, referentiel, (rows, statuts) => {
        const parId = new Map(rows.map((r) => [r.id, r]))
        for (const l of lignesTravaux(rows, statuts)) {
          const s = parId.get(l.id)!.statut_travaux_id
          expect(l.termine).toBe(
            (STATUTS_TRAVAUX_TERMINAUX as readonly number[]).includes(s),
          )
        }
      }),
      CFG,
    )
  })

  it('est TOTALE (référentiel vide, dates nulles ou abîmées)', () => {
    // ORACLE : cf. demandes — aucune donnée de base ne doit faire tomber la page.
    fc.assert(
      fc.property(travaux, referentiel, (rows, statuts) => {
        expect(Array.isArray(lignesTravaux(rows, statuts))).toBe(true)
        expect(Array.isArray(lignesTravaux(rows, new Map()))).toBe(true)
      }),
      CFG,
    )
  })
})

// ── Événements ────────────────────────────────────────────────────────────────

describe('lignesEvenements — propriétés', () => {
  it('tient les trois promesses, quel que soit le référentiel fourni', () => {
    // ORACLE : cf. demandes et travaux.
    fc.assert(
      fc.property(evenements, referentiel, (rows, statuts) => {
        verifierLesTroisPromesses(
          lignesEvenements(rows, statuts),
          rows.map((r) => r.id),
        )
      }),
      { numRuns: 2000, seed: 42 },
    )
  })

  it('`termine` suit `STATUTS_EVENEMENTS_TERMINAUX`', () => {
    // ORACLE : référentiel des statuts terminaux de la feature Événements.
    fc.assert(
      fc.property(evenements, referentiel, (rows, statuts) => {
        const parId = new Map(rows.map((r) => [r.id, r]))
        for (const l of lignesEvenements(rows, statuts)) {
          const s = parId.get(l.id)!.statut_evenement_id
          expect(l.termine).toBe(
            (STATUTS_EVENEMENTS_TERMINAUX as readonly number[]).includes(s),
          )
        }
      }),
      CFG,
    )
  })

  it('est TOTALE (référentiel vide, dates nulles ou abîmées)', () => {
    // ORACLE : cf. demandes — le tableau de bord ne tombe pas.
    fc.assert(
      fc.property(evenements, referentiel, (rows, statuts) => {
        expect(Array.isArray(lignesEvenements(rows, statuts))).toBe(true)
        expect(Array.isArray(lignesEvenements(rows, new Map()))).toBe(true)
      }),
      CFG,
    )
  })
})

// ── Invariants transverses aux trois journaux ─────────────────────────────────

describe('les trois journaux se comportent IDENTIQUEMENT', () => {
  it('même forme de sortie pour la même forme d’entrée (homogénéité de la carte)', () => {
    // ORACLE : raison d'être du module — « présenter et ouvrir EXACTEMENT de la
    // même façon d'un onglet à l'autre ». À libellés, ids et terminalité égaux,
    // les titres (hors `diTitre`), slugs, terminalité et ORDRE doivent coïncider
    // entre travaux et événements, qui partagent la même mécanique.
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.record({ id, nom: libelle, termine: fc.boolean() }), {
          selector: (r) => r.id,
          maxLength: 12,
        }),
        (base) => {
          const rowsT: RowTravaux[] = base.map((b) => ({
            id: b.id,
            titre: b.nom,
            date_demande: '2026-01-01',
            date_fin: null,
            statut_travaux_id: b.termine ? 4 : 1,
          }))
          const rowsE: RowEvenement[] = base.map((b) => ({
            id: b.id,
            titre: b.nom,
            date_evenement: '2026-01-01',
            date_cloture: null,
            statut_evenement_id: b.termine ? 4 : 1,
          }))
          const t = lignesTravaux(rowsT, new Map())
          const e = lignesEvenements(rowsE, new Map())
          expect(t.map((l) => [l.id, l.titre, l.slug, l.termine])).toEqual(
            e.map((l) => [l.id, l.titre, l.slug, l.termine]),
          )
        },
      ),
      CFG,
    )
  })

  it('une liste VIDE rend une liste vide (pas de ligne fantôme)', () => {
    // ORACLE : le cardinal est conservé — cas de base du site sans activité.
    const vides: RowDemande[] = []
    expect(lignesDemandes(vides)).toEqual([])
    expect(lignesTravaux([], new Map())).toEqual([])
    expect(lignesEvenements([], new Map())).toEqual([])
  })
})
