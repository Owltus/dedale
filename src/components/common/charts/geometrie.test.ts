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

// ── Géométrie RÉELLE du secteur annulaire ────────────────────────────────────

describe('secteurAnnulaire — portion de couronne rendue', () => {
  /**
   * Boîte englobante ANALYTIQUE d'une portion de couronne : l'ensemble des points
   * polaires (r, θ) pour r ∈ {rInt, rExt} et θ parcourant [a0, a1].
   * Échantillonnage dense — l'erreur de corde vaut r·(Δθ)²/8, soit moins de
   * 1e-3 ici. La conversion polaire est réécrite sur place (0° = haut, sens
   * horaire) pour n'emprunter AUCUN calcul au code de production.
   */
  function boiteCouronne(
    cx: number,
    cy: number,
    rExt: number,
    rInt: number,
    a0: number,
    a1: number,
  ): Boite {
    const N = 2000
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i <= N; i += 1) {
      const rad = (((a1 - a0) * (i / N) + a0) * Math.PI) / 180
      for (const r of [rInt, rExt]) {
        xs.push(cx + r * Math.sin(rad))
        ys.push(cy - r * Math.cos(rad))
      }
    }
    return {
      xMin: Math.min(...xs),
      xMax: Math.max(...xs),
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
    }
  }

  it('couvre EXACTEMENT la portion de couronne demandée', () => {
    // ORACLE : géométrie du secteur — la portion de couronne balayée entre a0 et
    // a1 occupe la boîte englobante des points (r, θ) pour r ∈ {rInt, rExt} et
    // θ ∈ [a0, a1]. Cette boîte est RECALCULÉE ici par échantillonnage dense,
    // puis confrontée à celle qu'on LIT du chemin produit (`boiteEnglobante`
    // applique la spec SVG des arcs, drapeau « grand arc » compris). Un drapeau
    // mal posé fait tracer au moteur l'arc complémentaire — la part déborde de
    // l'autre côté du cadran ; un arc absent ampute la couronne d'une extrémité.
    //
    // TOLÉRANCE : `fmt` arrondit chaque coordonnée au centième, et le moteur SVG
    // RECONSTRUIT le centre de l'arc à partir de ces extrémités arrondies. Cette
    // reconstruction est mal conditionnée aux deux bouts : quand la corde frôle
    // le diamètre (étendue ≈ 180°, facteur 1/|cos(span/2)|) et quand elle est
    // minuscule (étendue ≈ 0° ou 360°, facteur 1/|sin(span/2)|). La tolérance
    // suit donc CES deux facteurs plutôt qu'un chiffre plat, et les étendues à
    // moins de 25° du demi-tour — où le facteur diverge — sont écartées
    // franchement : c'est l'imprécision déjà documentée par le `it.fails`
    // ci-dessus, pas une affaire de drapeau.
    fc.assert(
      fc.property(
        fc.double({ min: -40, max: 40, noNaN: true }),
        fc.double({ min: -40, max: 40, noNaN: true }),
        fc.double({ min: 40, max: 120, noNaN: true }),
        fc.double({ min: 0.2, max: 0.8, noNaN: true }),
        fc.double({ min: -180, max: 540, noNaN: true }),
        fc.double({ min: 1, max: 359, noNaN: true }),
        (cx, cy, rExt, ratio, a0, span) => {
          fc.pre(Math.abs(span - 180) > 25)
          const rInt = rExt * ratio
          const a1 = a0 + span
          const demi = (span * Math.PI) / 360
          const tolerance =
            0.05 +
            0.03 * (1 / Math.abs(Math.sin(demi)) + 1 / Math.abs(Math.cos(demi)))
          const lue = boiteEnglobante(
            secteurAnnulaire(cx, cy, rExt, rInt, a0, a1),
          )
          const attendue = boiteCouronne(cx, cy, rExt, rInt, a0, a1)
          expect(lue).not.toBeNull()
          for (const cote of ['xMin', 'xMax', 'yMin', 'yMax'] as const) {
            expect(Math.abs(lue![cote] - attendue[cote])).toBeLessThan(
              tolerance,
            )
          }
        },
      ),
      { numRuns: 300, seed: 42 },
    )
  })

  it('une part étroite est bornée par ses QUATRE coins, rayon intérieur compris', () => {
    // ORACLE : géométrie — un secteur qui tient dans un même quadrant ne
    // rencontre aucun extrême d'axe du cercle : sa boîte est donnée par ses
    // quatre coins, et chaque côté par un coin différent. Le coin le plus proche
    // du centre (rayon INTÉRIEUR, angle de départ) borne la boîte à gauche :
    // oublier l'arc intérieur ferait grossir la part vers l'extérieur. Les
    // quatre bornes sont recalculées en trigonométrie pure, jamais relevées sur
    // une sortie.
    const rExt = 100
    const rInt = 40
    const a0 = 10
    const a1 = 80
    const sin = (deg: number) => Math.sin((deg * Math.PI) / 180)
    const cos = (deg: number) => Math.cos((deg * Math.PI) / 180)
    const boite = boiteEnglobante(secteurAnnulaire(0, 0, rExt, rInt, a0, a1))
    expect(boite).not.toBeNull()
    expect(boite!.xMin).toBeCloseTo(rInt * sin(a0), 1) // coin intérieur de départ
    expect(boite!.xMax).toBeCloseTo(rExt * sin(a1), 1) // coin extérieur d'arrivée
    expect(boite!.yMin).toBeCloseTo(-rExt * cos(a0), 1) // coin extérieur de départ
    expect(boite!.yMax).toBeCloseTo(-rInt * cos(a1), 1) // coin intérieur d'arrivée
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

// ── Espacement entre parts du donut ──────────────────────────────────────────

describe('espacement des parts du donut', () => {
  it('sans groupe, l’écart entre deux parts voisines vaut EXACTEMENT gapDeg', () => {
    // ORACLE : `gapDeg` est l'espace angulaire laissé à chaque frontière, et
    // chaque part en cède la moitié de part et d'autre. Il en découle : l'écart
    // entre la fin d'une part et le début de la suivante vaut gapDeg, la
    // première part commence à gapDeg/2 (sa moitié de la frontière cyclique avec
    // la dernière), la dernière finit à 360 - gapDeg/2, et parts + espaces
    // refont exactement le tour. Aucune part n'est « complète » dès qu'il y en a
    // plusieurs : un anneau entier ne sait décrire qu'une part UNIQUE.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 200 }), {
          minLength: 2,
          maxLength: 6,
        }),
        fc.double({ min: 0.5, max: 5, noNaN: true }),
        (valeurs, gap) => {
          const { parts } = calculerPartsDonut(
            valeurs.map((v, i) => segment(`s${String(i)}`, v)),
            gap,
          )
          expect(parts).toHaveLength(valeurs.length)
          expect(parts[0]!.a0).toBeCloseTo(gap / 2, 9)
          expect(parts[parts.length - 1]!.a1).toBeCloseTo(360 - gap / 2, 9)
          for (let i = 0; i + 1 < parts.length; i += 1) {
            expect(parts[i + 1]!.a0 - parts[i]!.a1).toBeCloseTo(gap, 9)
          }
          const somme = parts.reduce((acc, p) => acc + (p.a1 - p.a0), 0)
          expect(somme).toBeCloseTo(360 - valeurs.length * gap, 9)
          for (const p of parts) expect(p.complet).toBe(false)
        },
      ),
      CFG,
    )
  })

  it('deux parts VOISINES d’un même groupe se soudent, sans espace', () => {
    // ORACLE : un `group` non vide partagé par deux parts ADJACENTES les soude
    // en une seule section subdivisée — la frontière INTERNE au groupe ne
    // consomme aucun espace. Toute autre frontière en consomme un entier :
    // groupes différents, groupe absent, ou chaîne vide (qui n'est pas un
    // groupe). Et le tour est CYCLIQUE : la frontière entre la dernière part et
    // la première obéit à la même règle, à cheval sur le 0°.
    const gap = 12
    const groupes = ['a', 'a', 'b', undefined, undefined, '', '', 'a']
    // Écarts attendus, frontière par frontière — la dernière est la frontière
    // cyclique entre la dernière part et la première.
    const ECARTS = [
      0, // s0|s1 : même groupe « a » → soudées
      gap, // s1|s2 : « a » → « b »
      gap, // s2|s3 : « b » → aucun groupe
      gap, // s3|s4 : deux parts SANS groupe ne forment pas un groupe
      gap, // s4|s5 : aucun groupe → chaîne vide
      gap, // s5|s6 : deux chaînes VIDES ne forment pas un groupe non plus
      gap, // s6|s7 : chaîne vide → « a »
      0, // s7|s0 : même groupe « a », à cheval sur le 0°
    ]
    const { parts } = calculerPartsDonut(
      groupes.map((g, i) => segment(`s${String(i)}`, 100, g)),
      gap,
    )
    expect(parts).toHaveLength(groupes.length)
    for (let i = 0; i < parts.length; i += 1) {
      const suivante = parts[(i + 1) % parts.length]!
      const ecart =
        i + 1 < parts.length
          ? suivante.a0 - parts[i]!.a1
          : suivante.a0 + 360 - parts[i]!.a1
      expect(ecart).toBeCloseTo(ECARTS[i]!, 9)
    }
  })

  it('une catégorie à zéro (ou négative) n’occupe AUCUNE part', () => {
    // ORACLE : un donut représente des effectifs positifs. Une catégorie vide ou
    // aberrante n'a pas de part à occuper et ne compte pas dans le total ; un
    // donut dont une SEULE catégorie est non nulle est donc un anneau complet,
    // et son total vaut la valeur de cette seule catégorie.
    const { total, parts } = calculerPartsDonut(
      [segment('vide', 0), segment('negatif', -3), segment('seule', 5)],
      4,
    )
    expect(total).toBe(5)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.seg.key).toBe('seule')
    expect(parts[0]!.complet).toBe(true)
  })

  it('une part dont l’espacement absorbe toute l’étendue disparaît', () => {
    // ORACLE : une part n'existe que si son arc a une étendue STRICTEMENT
    // positive — un arc d'angle nul n'a rien à dessiner. Deux catégories égales
    // séparées par un espacement de 180° voient chacune leurs 180° entièrement
    // mangés (90° de chaque côté) : il ne reste aucune part.
    expect(
      calculerPartsDonut([segment('a', 1), segment('b', 1)], 180).parts,
    ).toHaveLength(0)
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

  it('un nœud à liste d’enfants VIDE est sa propre feuille', () => {
    // ORACLE : définition — un nœud sans enfant EST une feuille, que la
    // propriété `enfants` soit absente ou présente mais vide. Traiter une liste
    // vide comme un nœud interne donnerait un poids nul : la part
    // disparaîtrait du sunburst alors que la donnée, elle, existe.
    fc.assert(
      fc.property(fc.double({ min: -5, max: 100, noNaN: true }), (poids) => {
        const base: SunburstNode = {
          key: 'k',
          label: 'n',
          couleur: 'var(--chart-1)',
          poids,
        }
        expect(poidsFeuilles({ ...base, enfants: [] })).toBe(Math.max(poids, 0))
        expect(poidsFeuilles(base)).toBe(Math.max(poids, 0))
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

  it('chaque nœud produit UN arc, à la profondeur de son niveau dans l’arbre', () => {
    // ORACLE : un sunburst est une pile d'anneaux concentriques — l'anneau d'un
    // nœud est donné par sa distance à la racine. La racine reçoit la profondeur
    // de départ, ses enfants celle-ci + 1, leurs enfants + 2, et chaque nœud de
    // l'arbre apparaît une fois et une seule. Le niveau attendu est lu ici dans
    // la CLÉ du nœud (« r » → 1, « r.1 » → 2, « r.1.1 » → 3), qui l'encode
    // indépendamment du calcul mesuré.
    const feuille = (key: string, poids: number): SunburstNode => ({
      key,
      label: key,
      couleur: 'var(--chart-1)',
      poids,
    })
    const arbre: SunburstNode = {
      ...feuille('r', 0),
      enfants: [
        {
          ...feuille('r.1', 0),
          enfants: [feuille('r.1.1', 3), feuille('r.1.2', 1)],
        },
        feuille('r.2', 2),
      ],
    }
    const arcs: Arc[] = []
    disposer([arbre], 0, 360, poidsFeuilles(arbre), 1, arcs)
    expect(arcs).toHaveLength(5)
    expect(new Set(arcs.map((a) => a.node.key)).size).toBe(5)
    for (const a of arcs) {
      expect(a.depth).toBe(a.node.key.split('.').length)
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// MUTANTS ÉQUIVALENTS — inutile de rouvrir l'enquête
//
// Le rapport Stryker de ce module signale dix mutants « survivants ». Ils sont
// tous ÉQUIVALENTS : aucune exécution ne peut les distinguer du code d'origine
// (ou, pour deux d'entre eux, aucun RENDU), donc aucun test ne peut les tuer
// sans devenir tautologique.
//
// — geometrie.ts L27 · `a1 - a0 > 180` → `>= 180` (drapeau « grand arc »)
//   Les deux ne divergent que si l'étendue vaut EXACTEMENT 180°. Dans ce cas la
//   corde relie deux points diamétralement opposés, donc |P1P2| = 2r : dans la
//   conversion « endpoint → center » de la spec SVG (1.1 annexe F.6.5), le terme
//   `num = rx²·ry² - rx²·y1'² - ry²·x1'²` s'annule, le coefficient ±√(num/den)
//   vaut 0, et le centre reconstruit est le milieu de la corde QUEL QUE SOIT le
//   drapeau. Les deux valeurs décrivent alors le même demi-cercle.
//
// — geometrie.ts L38 et L68 · `].join(' ')` → `].join("")`
//   Chaque élément joint commence par une lettre de commande (M, A, L, A, Z), et
//   la grammaire des chemins SVG rend l'espace entre un nombre et la lettre de
//   commande SUIVANTE facultatif. Le chemin produit diffère caractère pour
//   caractère mais est strictement identique au rendu ; seule une comparaison de
//   chaîne attendue — c'est-à-dire un test tautologique — les séparerait.
//
// — geometrie.ts L95 · `if (total <= 0)` → `if (false)`, et `total <= 0` → `< 0`
//   `actifs` ne retient que des segments de valeur > 0, donc `total > 0` dès que
//   `actifs` est non vide, et `total === 0` exactement quand il est vide. Dans ce
//   dernier cas, sauter le retour anticipé fait exécuter `actifs.map(…).filter(…)`
//   sur un tableau VIDE, qui rend `[]` : exactement `{ total: 0, parts: [] }`.
//
// — geometrie.ts L105 · `suivant?.group` → `suivant.group`
//   `suivant = actifs[(i + 1) % n]` avec `0 ≤ (i + 1) % n < n = actifs.length` :
//   l'index est toujours dans les bornes, `suivant` n'est jamais `undefined`. Le
//   chaînage optionnel ne protège rien — il n'est là que pour `noUncheckedIndexedAccess`.
//
// — geometrie.ts L118 et L120 · `gapApres[…] ?? gapDeg` → `gapApres[…] && gapDeg`
//   Mêmes index toujours dans les bornes : `??` ne se déclenche jamais. Et chaque
//   élément de `gapApres` vaut soit 0 soit `gapDeg` ; or `0 && gapDeg === 0` et
//   `gapDeg && gapDeg === gapDeg` (et si `gapDeg === 0`, tous les éléments valent
//   0 et `0 && 0 === 0`). Résultat identique dans tous les cas.
//
// — geometrie.ts L189 · `node.enfants.length > 0` → `true`, et → `>= 0`
//   La garde `node.enfants &&` reste en place : la seule entrée nouvellement
//   admise est `enfants: []`, qui déclenche `disposer([], …)`, une boucle sur zéro
//   élément qui ne pousse aucun arc. Résultat identique.
//   ⚠️ Les MÊMES mutations à la L160, dans `poidsFeuilles`, ne sont PAS
//   équivalentes (`[].reduce(…, 0)` vaut 0 au lieu de `Math.max(poids, 0)`) : la
//   propriété « un nœud à liste d'enfants VIDE est sa propre feuille » les tue.
// ─────────────────────────────────────────────────────────────────────────────
