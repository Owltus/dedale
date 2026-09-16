import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  anneauComplet,
  calculerPartsDonut,
  disposer,
  poidsFeuilles,
  polar,
  secteurAnnulaire,
  type Arc,
  type SunburstNode,
} from './geometrie'
import type { ChartSegment } from './chart-tokens'

/**
 * Propriétés (fast-check) de la géométrie des graphiques maison (donut,
 * sunburst).
 *
 * ORACLE COMMUN : la GÉOMÉTRIE elle-même — trigonométrie du cercle,
 * conservation des angles, et la spécification SVG pour la commande `A`. Aucun
 * attendu n'est une chaîne de chemin recopiée depuis une sortie observée : les
 * coordonnées sont TOUJOURS recalculées à partir du `d` produit (cf.
 * `boiteEnglobante` plus bas), sinon le test figerait le bug au lieu de le
 * détecter.
 */

const CFG = { numRuns: 1000, seed: 42 } as const

// ── Oracle indépendant : boîte englobante réelle d'un chemin SVG ──────────────

interface Point {
  x: number
  y: number
}

/**
 * Détermine si l'angle `theta` (radians) est réellement balayé par un arc qui
 * part de `t1` et tourne de `dt`. Exact (pas d'échantillonnage) : on ramène
 * `theta` modulo 2π dans l'intervalle balayé.
 */
function surArc(theta: number, t1: number, dt: number): boolean {
  const a = Math.min(t1, t1 + dt)
  const b = Math.max(t1, t1 + dt)
  const tour = 2 * Math.PI
  let th = theta + Math.ceil((a - theta) / tour) * tour
  while (th < a) th += tour
  return th <= b
}

/**
 * Points EXTRÊMES réellement atteints par une commande `A` de la spec SVG, via
 * la conversion « endpoint parameterization → center parameterization » (SVG 1.1
 * annexe F.6.5), puis les quatre extrêmes d'axe (0°, 90°, 180°, 270°) qui
 * tombent dans le balayage.
 *
 * ⚠️ Règle F.6.2 reproduite telle quelle : « If the endpoints (x1, y1) and
 * (x2, y2) are identical, then this is equivalent to omitting the elliptical arc
 * segment entirely. » C'est EXACTEMENT la règle qui faisait disparaître l'anneau
 * du donut quand il ne restait qu'une seule part — l'oracle doit donc l'appliquer
 * sans indulgence.
 */
function extremesArc(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  fA: number,
  fS: number,
  x2: number,
  y2: number,
): Point[] {
  if (x1 === x2 && y1 === y2) return [] // arc omis (spec F.6.2)
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (rx === 0 || ry === 0) return [{ x: x2, y: y2 }] // dégénère en segment

  const phi = (phiDeg * Math.PI) / 180
  const cosP = Math.cos(phi)
  const sinP = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cosP * dx + sinP * dy
  const y1p = -sinP * dx + cosP * dy

  // Agrandissement des rayons s'ils sont trop petits pour relier les extrémités.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const k = Math.sqrt(lambda)
    rx *= k
    ry *= k
  }

  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (fA !== fS ? 1 : -1) * Math.sqrt(Math.max(num / den, 0))
  const cxp = (coef * (rx * y1p)) / ry
  const cyp = (-coef * (ry * x1p)) / rx
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2

  const t1 = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
  const t2 = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
  let dt = t2 - t1
  if (fS === 0 && dt > 0) dt -= 2 * Math.PI
  if (fS === 1 && dt < 0) dt += 2 * Math.PI

  const pts: Point[] = [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ]
  for (const theta of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
    if (!surArc(theta, t1, dt)) continue
    const ex = rx * Math.cos(theta)
    const ey = ry * Math.sin(theta)
    pts.push({
      x: cx + cosP * ex - sinP * ey,
      y: cy + sinP * ex + cosP * ey,
    })
  }
  return pts
}

interface Boite {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

/** Extrait les nombres d'un fragment d'arguments de chemin SVG. */
function nombres(args: string): number[] {
  return (args.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? []).map(Number)
}

/**
 * Boîte englobante GÉOMÉTRIQUE d'un chemin `M`/`L`/`A`/`Z` — arcs compris, pas
 * seulement leurs extrémités. C'est l'oracle : il ne sait rien du code de
 * production, il ne sait que lire un chemin SVG comme le ferait un moteur de
 * rendu.
 */
function boiteEnglobante(d: string): Boite | null {
  const pts: Point[] = []
  let cur: Point = { x: 0, y: 0 }
  let depart: Point = { x: 0, y: 0 }
  for (const m of d.matchAll(/([MALZ])([^MALZ]*)/g)) {
    const cmd = m[1]
    const n = nombres(m[2] ?? '')
    if (cmd === 'M') {
      cur = { x: n[0] ?? 0, y: n[1] ?? 0 }
      depart = cur
      pts.push(cur)
    } else if (cmd === 'L') {
      cur = { x: n[0] ?? 0, y: n[1] ?? 0 }
      pts.push(cur)
    } else if (cmd === 'A') {
      const suite = { x: n[5] ?? 0, y: n[6] ?? 0 }
      pts.push(
        ...extremesArc(
          cur.x,
          cur.y,
          n[0] ?? 0,
          n[1] ?? 0,
          n[2] ?? 0,
          n[3] ?? 0,
          n[4] ?? 0,
          suite.x,
          suite.y,
        ),
      )
      cur = suite
    } else if (cmd === 'Z') {
      cur = depart
    }
  }
  if (pts.length === 0) return null
  return {
    xMin: Math.min(...pts.map((p) => p.x)),
    xMax: Math.max(...pts.map((p) => p.x)),
    yMin: Math.min(...pts.map((p) => p.y)),
    yMax: Math.max(...pts.map((p) => p.y)),
  }
}

// ── Arbitraires ──────────────────────────────────────────────────────────────

/** Angles « quelconques » : bornés, mais avec les cas limites en dur. */
const arbAngle = fc.oneof(
  { arbitrary: fc.double({ min: -720, max: 720, noNaN: true }), weight: 6 },
  {
    arbitrary: fc.constantFrom(
      0,
      360,
      -360,
      180,
      -180,
      359.999,
      0.0001,
      1e-9,
      -1e-9,
      1e-12,
    ),
    weight: 4,
  },
)
const arbCentre = fc.double({ min: -200, max: 200, noNaN: true })
const arbRayon = fc.double({ min: 0, max: 200, noNaN: true })

function segment(cle: string, value: number, group?: string): ChartSegment {
  return { key: cle, label: cle, value, tone: 'neutral', group }
}

const arbSegments = fc.array(
  fc.record({
    value: fc.integer({ min: 1, max: 1000 }),
    group: fc.option(fc.constantFrom('a', 'b', ''), { nil: undefined }),
  }),
  { minLength: 1, maxLength: 20 },
)

function arbNoeud(profondeur: number): fc.Arbitrary<SunburstNode> {
  const feuille = fc.record({
    key: fc.string({ minLength: 1, maxLength: 5 }),
    label: fc.constant('n'),
    couleur: fc.constant('var(--chart-1)'),
    poids: fc.double({ min: -5, max: 100, noNaN: true }),
  })
  if (profondeur <= 0) return feuille
  return fc.oneof(
    feuille,
    fc.record({
      key: fc.string({ minLength: 1, maxLength: 5 }),
      label: fc.constant('n'),
      couleur: fc.constant('var(--chart-1)'),
      poids: fc.double({ min: -5, max: 100, noNaN: true }),
      enfants: fc.array(arbNoeud(profondeur - 1), {
        minLength: 1,
        maxLength: 4,
      }),
    }),
  )
}

/** Feuilles d'un arbre, dans l'ordre de parcours de `poidsFeuilles`. */
function feuilles(node: SunburstNode): SunburstNode[] {
  if (node.enfants && node.enfants.length > 0) {
    return node.enfants.flatMap(feuilles)
  }
  return [node]
}

// ── polar ────────────────────────────────────────────────────────────────────

describe('polar', () => {
  it('place le point à EXACTEMENT `r` du centre', () => {
    // ORACLE : définition du cercle — tout point d'un cercle de rayon r centré
    // en (cx, cy) est à distance r du centre, quel que soit l'angle.
    fc.assert(
      fc.property(
        arbCentre,
        arbCentre,
        arbRayon,
        arbAngle,
        (cx, cy, r, deg) => {
          const p = polar(cx, cy, r, deg)
          expect(Math.abs(Math.hypot(p.x - cx, p.y - cy) - r)).toBeLessThan(
            1e-9,
          )
        },
      ),
      CFG,
    )
  })

  it('un tour complet (+360°) est l’identité', () => {
    // ORACLE : périodicité 2π des fonctions trigonométriques — un tour complet
    // ramène au même point du cercle.
    fc.assert(
      fc.property(
        arbCentre,
        arbCentre,
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: -360, max: 360, noNaN: true }),
        (cx, cy, r, deg) => {
          const a = polar(cx, cy, r, deg)
          const b = polar(cx, cy, r, deg + 360)
          expect(Math.abs(a.x - b.x)).toBeLessThan(1e-9)
          expect(Math.abs(a.y - b.y)).toBeLessThan(1e-9)
        },
      ),
      CFG,
    )
  })

  it('0° est en HAUT et le sens est horaire', () => {
    // ORACLE : convention documentée du module (0° = haut, sens horaire) —
    // 0° → (cx, cy - r), 90° → (cx + r, cy), 180° → (cx, cy + r).
    const haut = polar(50, 50, 10, 0)
    expect(haut.x).toBeCloseTo(50, 9)
    expect(haut.y).toBeCloseTo(40, 9)
    const droite = polar(50, 50, 10, 90)
    expect(droite.x).toBeCloseTo(60, 9)
    expect(droite.y).toBeCloseTo(50, 9)
    const bas = polar(50, 50, 10, 180)
    expect(bas.x).toBeCloseTo(50, 9)
    expect(bas.y).toBeCloseTo(60, 9)
  })
})

// ── Validité des chemins produits ────────────────────────────────────────────

describe('chemins SVG produits', () => {
  it('`secteurAnnulaire` produit toujours un chemin syntaxiquement exploitable', () => {
    // ORACLE : un attribut `d` doit être une suite de commandes SVG valides —
    // aucune coordonnée non finie (un `NaN` ou `Infinity` fait rejeter le chemin
    // entier par le moteur de rendu), un sous-chemin ouvert par `M` et refermé
    // par `Z`. Vrai pour TOUS les angles, y compris 0°, 360°, négatifs, infimes.
    fc.assert(
      fc.property(
        arbCentre,
        arbCentre,
        arbRayon,
        arbRayon,
        arbAngle,
        arbAngle,
        (cx, cy, rExt, rInt, a0, a1) => {
          const d = secteurAnnulaire(cx, cy, rExt, rInt, a0, a1)
          expect(d).not.toMatch(/NaN/)
          expect(d).not.toMatch(/Infinity/)
          expect(d.startsWith('M')).toBe(true)
          expect(d.endsWith('Z')).toBe(true)
          // Toutes les coordonnées relues doivent être finies.
          for (const v of nombres(d.replace(/[MALZ]/g, ' '))) {
            expect(Number.isFinite(v)).toBe(true)
          }
        },
      ),
      CFG,
    )
  })

  it('`anneauComplet` produit toujours un chemin syntaxiquement exploitable', () => {
    // ORACLE : idem — deux sous-chemins concentriques, chacun ouvert par `M` et
    // refermé par `Z`, sans coordonnée non finie.
    fc.assert(
      fc.property(
        arbCentre,
        arbCentre,
        arbRayon,
        arbRayon,
        (cx, cy, re, ri) => {
          const d = anneauComplet(cx, cy, re, ri)
          expect(d).not.toMatch(/NaN/)
          expect(d).not.toMatch(/Infinity/)
          expect(d.startsWith('M')).toBe(true)
          expect(d.endsWith('Z')).toBe(true)
          // Deux sous-chemins (cercle extérieur + cercle intérieur).
          expect((d.match(/M/g) ?? []).length).toBe(2)
          expect((d.match(/Z/g) ?? []).length).toBe(2)
        },
      ),
      CFG,
    )
  })
})

// ── NON-RÉGRESSION du bug réel : l'anneau qui disparaissait ──────────────────

describe('part unique couvrant tout le tour (bug de l’arc dégénéré)', () => {
  it('`anneauComplet` dessine un anneau VISIBLE de diamètre 2 × rExt', () => {
    // ORACLE : un anneau de rayon extérieur rExt centré en (cx, cy) occupe le
    // carré [cx-rExt, cx+rExt] × [cy-rExt, cy+rExt]. La boîte englobante est donc
    // de côté 2 × rExt — recalculée À PARTIR DU `d` produit par un lecteur de
    // chemin SVG indépendant (`boiteEnglobante`), jamais comparée à une chaîne
    // attendue.
    //
    // C'est le test de non-régression du bug réel : le contournement historique
    // (secteur de 0,0001° à 359,999°) donne deux extrémités IDENTIQUES une fois
    // arrondies au centième, la spec SVG omet alors l'arc, et la boîte s'effondre
    // à une largeur nulle → l'anneau disparaissait à l'écran.
    //
    // Borne SUPÉRIEURE : `fmt` arrondit chaque coordonnée au centième, donc la
    // corde imprimée peut être plus courte que 2 × rExt d'au plus 0,01 alors que
    // le rayon imprimé, lui, reste ≈ rExt. Le moteur SVG décentre alors l'arc de
    // h = √(rExt·δ) au plus (δ ≤ 0,02 en cumulant l'arrondi du rayon), ce qui
    // élargit la boîte d'au plus 2h. Cette borne est ANALYTIQUE, pas un chiffre
    // relevé sur une sortie.
    fc.assert(
      fc.property(
        arbCentre,
        arbCentre,
        fc.double({ min: 5, max: 200, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (cx, cy, rExt, ratio) => {
          const rInt = 1 + ratio * (rExt - 2)
          const boite = boiteEnglobante(anneauComplet(cx, cy, rExt, rInt))
          expect(boite).not.toBeNull()
          const majorant = 2 * rExt + 2 * Math.sqrt(0.02 * rExt) + 0.05
          for (const cote of [
            boite!.xMax - boite!.xMin,
            boite!.yMax - boite!.yMin,
          ]) {
            // Jamais effondré ni rétréci : c'est LE bug de l'anneau invisible.
            expect(cote).toBeGreaterThan(2 * rExt - 0.05)
            expect(cote).toBeLessThan(majorant)
          }
        },
      ),
      CFG,
    )
  })

  it.fails(
    'BUG CANDIDAT — l’anneau déborde quand `fmt` arrondit ses deux extrémités dans des sens opposés',
    () => {
      // ORACLE : un anneau de rayon extérieur rExt occupe EXACTEMENT un carré de
      // côté 2 × rExt. Ici cy - rExt tombe pile sur une valeur qui s'arrondit vers
      // le BAS (« -18.34 ») pendant que cy + rExt s'arrondit vers le HAUT
      // (« 18.35 ») : la corde imprimée (36,69) devient plus courte que le rayon
      // imprimé (18,35) ne le permet, le moteur SVG décentre les deux demi-arcs de
      // part et d'autre de la corde et l'anneau rendu mesure 37,56 au lieu de
      // 36,69 — soit ~2,4 % trop large, et un anneau très légèrement lenticulaire.
      //
      // ATTENDU : 36,690 · OBSERVÉ : 37,557 (écart 0,867).
      // Sans conséquence dans Dédale (le donut est toujours tracé en cx=cy=50,
      // rExt=46 → coordonnées exactes au centième), mais c'est bien une imprécision
      // du tracé, pas du test : d'où le `it.fails` plutôt qu'une tolérance élargie.
      const cx = 0
      const cy = 1.7763568394002505e-15
      const rExt = 18.345000000000002
      const boite = boiteEnglobante(anneauComplet(cx, cy, rExt, 1))
      expect(Math.abs(boite!.xMax - boite!.xMin - 2 * rExt)).toBeLessThan(0.05)
    },
  )

  it('l’ancien contournement (secteur 0,0001° → 359,999°) s’effondre — d’où `anneauComplet`', () => {
    // ORACLE : la spec SVG F.6.2 omet un arc dont les deux extrémités
    // coïncident. Après arrondi au centième par `fmt`, polar(0,0001°) et
    // polar(359,999°) tombent sur le MÊME point → arcs omis → plus d'anneau.
    // Ce test documente la cause du bug ; il doit rester vrai (c'est pour cela
    // qu'on ne trace pas une part unique comme un secteur).
    const boiteSecteur = boiteEnglobante(
      secteurAnnulaire(50, 50, 46, 30, 0.0001, 359.999),
    )
    expect(boiteSecteur).not.toBeNull()
    expect(boiteSecteur!.xMax - boiteSecteur!.xMin).toBeLessThan(1)
    // Alors que l'anneau complet, lui, couvre bien tout le cadran.
    const boiteAnneau = boiteEnglobante(anneauComplet(50, 50, 46, 30))
    expect(boiteAnneau!.xMax - boiteAnneau!.xMin).toBeCloseTo(92, 1)
    expect(boiteAnneau!.yMax - boiteAnneau!.yMin).toBeCloseTo(92, 1)
  })

  it('un seul segment actif ⇒ la part est marquée `complet` (donc tracée en anneau)', () => {
    // ORACLE : une part qui vaut 100 % du total couvre 360° ; un secteur ne sait
    // pas décrire 360° (extrémités confondues), seul l'anneau le peut. Le marquage
    // `complet` ne dépend NI de la valeur NI de l'espacement demandé — c'est
    // justement parce que l'espacement rogne les angles (360° - gapDeg) que le
    // secteur dégénérerait.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        (valeur, gap) => {
          const { parts } = calculerPartsDonut([segment('seul', valeur)], gap)
          expect(parts).toHaveLength(1)
          expect(parts[0]!.complet).toBe(true)
          // Sans espacement, la part unique couvre bien le tour complet.
          const { parts: sansGap } = calculerPartsDonut(
            [segment('seul', valeur)],
            0,
          )
          expect(sansGap[0]!.a1 - sansGap[0]!.a0).toBeCloseTo(360, 9)
        },
      ),
      CFG,
    )
  })
})

// ── Conservation des parts du donut ──────────────────────────────────────────

describe('calculerPartsDonut', () => {
  it('la somme des angles vaut 360° (sans espacement)', () => {
    // ORACLE : conservation — les parts d'un donut partitionnent le tour complet.
    // Sans espace angulaire (gapDeg = 0), la somme des étendues doit valoir
    // exactement un tour, quelles que soient les valeurs.
    fc.assert(
      fc.property(arbSegments, (defs) => {
        const segments = defs.map((d, i) =>
          segment(`s${String(i)}`, d.value, d.group),
        )
        const { total, parts } = calculerPartsDonut(segments, 0)
        expect(total).toBeGreaterThan(0)
        const somme = parts.reduce((acc, p) => acc + (p.a1 - p.a0), 0)
        expect(Math.abs(somme - 360)).toBeLessThan(1e-9)
      }),
      CFG,
    )
  })

  it('les parts sont ordonnées et jointives (sans espacement)', () => {
    // ORACLE : partition d'un intervalle — les parts se suivent sans trou ni
    // recouvrement, de 0° à 360°.
    fc.assert(
      fc.property(arbSegments, (defs) => {
        const segments = defs.map((d, i) => segment(`s${String(i)}`, d.value))
        const { parts } = calculerPartsDonut(segments, 0)
        expect(parts[0]!.a0).toBeCloseTo(0, 9)
        expect(parts[parts.length - 1]!.a1).toBeCloseTo(360, 9)
        for (let i = 0; i + 1 < parts.length; i += 1) {
          expect(Math.abs(parts[i]!.a1 - parts[i + 1]!.a0)).toBeLessThan(1e-9)
        }
      }),
      CFG,
    )
  })

  it('un total nul ou négatif ne produit AUCUNE part (jamais de division par zéro)', () => {
    // ORACLE : 0/0 et x/0 n'ont pas de sens géométrique — l'absence de donnée
    // doit produire l'ensemble vide, pas des angles NaN ou infinis.
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: -1000, max: 0, noNaN: true }), {
          maxLength: 10,
        }),
        (valeurs) => {
          const segments = valeurs.map((v, i) => segment(`s${String(i)}`, v))
          const { total, parts } = calculerPartsDonut(segments, 2)
          expect(total).toBeLessThanOrEqual(0)
          expect(parts).toHaveLength(0)
        },
      ),
      CFG,
    )
  })

  it('les angles produits sont toujours finis, y compris avec un espacement', () => {
    // ORACLE : un angle est un réel fini ; aucun `gapDeg`, si grand soit-il, ne
    // doit faire apparaître NaN ou Infinity (il peut en revanche produire des
    // parts vides, qui sont alors filtrées).
    fc.assert(
      fc.property(
        arbSegments,
        fc.double({ min: 0, max: 90, noNaN: true }),
        (defs, gap) => {
          const segments = defs.map((d, i) =>
            segment(`s${String(i)}`, d.value, d.group),
          )
          const { parts } = calculerPartsDonut(segments, gap)
          for (const p of parts) {
            expect(Number.isFinite(p.a0)).toBe(true)
            expect(Number.isFinite(p.a1)).toBe(true)
            expect(p.complet || p.a1 > p.a0).toBe(true)
          }
        },
      ),
      CFG,
    )
  })
})

// ── Sunburst : poids et disposition ──────────────────────────────────────────

describe('poidsFeuilles', () => {
  it('le poids d’un nœud est la somme des poids de SES feuilles', () => {
    // ORACLE : définition récursive — le poids d'un nœud interne est, par
    // construction, la somme des poids (bornés à 0) de ses feuilles. Un poids
    // négatif ne retire jamais d'angle : il compte pour 0.
    fc.assert(
      fc.property(arbNoeud(3), (node) => {
        const attendu = feuilles(node).reduce(
          (acc, f) => acc + Math.max(f.poids, 0),
          0,
        )
        expect(Math.abs(poidsFeuilles(node) - attendu)).toBeLessThan(1e-9)
        expect(poidsFeuilles(node)).toBeGreaterThanOrEqual(0)
      }),
      CFG,
    )
  })

  it('le poids d’un nœud est la somme des poids de ses enfants directs', () => {
    // ORACLE : associativité de la somme — découper l'arbre par niveau ou par
    // feuilles donne le même total.
    fc.assert(
      fc.property(arbNoeud(3), (node) => {
        if (!node.enfants || node.enfants.length === 0) return
        const somme = node.enfants.reduce((acc, n) => acc + poidsFeuilles(n), 0)
        expect(Math.abs(poidsFeuilles(node) - somme)).toBeLessThan(1e-9)
      }),
      CFG,
    )
  })
})

describe('disposer', () => {
  /**
   * Vérifie qu'aucun arc d'un même anneau n'en chevauche un autre.
   * Les arcs d'étendue NULLE (poids nul → rien à dessiner) sont écartés : un
   * intervalle vide ne peut, par définition, en recouvrir aucun autre.
   */
  function verifierSansChevauchement(arcs: Arc[]) {
    const profondeurs = new Set(arcs.map((a) => a.depth))
    for (const d of profondeurs) {
      const rang = arcs
        .filter((a) => a.depth === d && a.a1 > a.a0)
        .sort((a, b) => a.a0 - b.a0 || a.a1 - b.a1)
      for (let i = 0; i + 1 < rang.length; i += 1) {
        expect(rang[i]!.a1).toBeLessThanOrEqual(rang[i + 1]!.a0 + 1e-9)
      }
    }
  }

  it('aucune part ne chevauche sa voisine et tout tient dans le tour', () => {
    // ORACLE : partition angulaire — les nœuds d'un même anneau se partagent les
    // 360° disponibles, sans recouvrement, chaque enfant restant dans la part de
    // son parent. Aucun angle n'est NaN ni hors [0, 360].
    fc.assert(
      fc.property(
        fc.array(arbNoeud(2), { minLength: 1, maxLength: 5 }),
        (noeuds) => {
          const total = noeuds.reduce((acc, n) => acc + poidsFeuilles(n), 0)
          const arcs: Arc[] = []
          disposer(noeuds, 0, 360, total, 1, arcs)
          for (const a of arcs) {
            expect(Number.isFinite(a.a0)).toBe(true)
            expect(Number.isFinite(a.a1)).toBe(true)
            expect(a.a1).toBeGreaterThanOrEqual(a.a0 - 1e-9)
            expect(a.a0).toBeGreaterThanOrEqual(-1e-9)
            expect(a.a1).toBeLessThanOrEqual(360 + 1e-9)
          }
          verifierSansChevauchement(arcs)
        },
      ),
      CFG,
    )
  })

  it('la somme des étendues d’un anneau vaut l’étendue disponible', () => {
    // ORACLE : conservation — la répartition par poids ne crée ni ne perd
    // d'angle : les racines couvrent exactement les 360° quand le total est > 0.
    fc.assert(
      fc.property(
        fc.array(arbNoeud(2), { minLength: 1, maxLength: 5 }),
        (noeuds) => {
          const total = noeuds.reduce((acc, n) => acc + poidsFeuilles(n), 0)
          if (total <= 0) return
          const arcs: Arc[] = []
          disposer(noeuds, 0, 360, total, 1, arcs)
          const somme = arcs
            .filter((a) => a.depth === 1)
            .reduce((acc, a) => acc + (a.a1 - a.a0), 0)
          expect(Math.abs(somme - 360)).toBeLessThan(1e-9)
        },
      ),
      CFG,
    )
  })

  it('des poids TOUS nuls ne produisent ni NaN ni chevauchement', () => {
    // ORACLE : 0/0 n'a pas de sens — un arbre entièrement à poids nul doit
    // produire des parts d'étendue nulle (rien à voir), jamais des angles NaN.
    fc.assert(
      fc.property(
        fc.array(arbNoeud(2), { minLength: 1, maxLength: 5 }),
        (noeuds) => {
          const zeroter = (n: SunburstNode): SunburstNode => ({
            ...n,
            poids: 0,
            enfants: n.enfants?.map(zeroter),
          })
          const nuls = noeuds.map(zeroter)
          const arcs: Arc[] = []
          disposer(nuls, 0, 360, 0, 1, arcs)
          for (const a of arcs) {
            expect(Number.isNaN(a.a0)).toBe(false)
            expect(Number.isNaN(a.a1)).toBe(false)
            expect(a.a1 - a.a0).toBe(0)
          }
          verifierSansChevauchement(arcs)
        },
      ),
      CFG,
    )
  })

  it('chaque enfant reste contenu dans la part de son parent', () => {
    // ORACLE : hiérarchie — un sunburst est un pavage imbriqué ; l'angle d'un
    // enfant est toujours un sous-intervalle de celui de son parent.
    fc.assert(
      fc.property(arbNoeud(3), (racine) => {
        const poids = poidsFeuilles(racine)
        const arcs: Arc[] = []
        disposer([racine], 0, 360, poids, 1, arcs)
        const parent = arcs[0]!
        for (const a of arcs.filter((x) => x.depth === 2)) {
          expect(a.a0).toBeGreaterThanOrEqual(parent.a0 - 1e-9)
          expect(a.a1).toBeLessThanOrEqual(parent.a1 + 1e-9)
        }
      }),
      CFG,
    )
  })
})
