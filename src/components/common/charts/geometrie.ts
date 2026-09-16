import type { ChartSegment } from '@/components/common/charts/chart-tokens'

/**
 * Géométrie SVG partagée par les primitives de dataviz maison (donut, sunburst).
 * Fonctions PURES, sans React ni DOM : tout le calcul d'angles, de parts et de
 * chemins vit ici, les composants ne font plus que rendre le résultat.
 */

/** Formate une coordonnée SVG (borne la précision). */
export const fmt = (v: number) => v.toFixed(2)

/** Coordonnées d'un point sur un cercle ; 0° = haut, sens horaire. */
export function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

/** Chemin d'un secteur annulaire (part de donut) entre deux angles. */
export function secteurAnnulaire(
  cx: number,
  cy: number,
  rExt: number,
  rInt: number,
  a0: number,
  a1: number,
) {
  const grand = a1 - a0 > 180 ? 1 : 0
  const oe0 = polar(cx, cy, rExt, a0)
  const oe1 = polar(cx, cy, rExt, a1)
  const oi1 = polar(cx, cy, rInt, a1)
  const oi0 = polar(cx, cy, rInt, a0)
  return [
    `M${fmt(oe0.x)} ${fmt(oe0.y)}`,
    `A${fmt(rExt)} ${fmt(rExt)} 0 ${String(grand)} 1 ${fmt(oe1.x)} ${fmt(oe1.y)}`,
    `L${fmt(oi1.x)} ${fmt(oi1.y)}`,
    `A${fmt(rInt)} ${fmt(rInt)} 0 ${String(grand)} 0 ${fmt(oi0.x)} ${fmt(oi0.y)}`,
    'Z',
  ].join(' ')
}

/**
 * Anneau COMPLET — une part unique qui couvre les 360°. Un secteur annulaire ne
 * sait PAS décrire ce cas : ses deux extrémités coïncident, et la spec SVG
 * demande alors d'omettre l'arc (« if the endpoints are identical, this is
 * equivalent to omitting the elliptical arc segment entirely »). Le contournement
 * historique — partir de 0,0001° pour finir à 359,999° — ne suffit pas non plus :
 * les deux points redeviennent IDENTIQUES une fois arrondis au centième par
 * `fmt`, et l'anneau disparaissait purement et simplement dès qu'il ne restait
 * qu'une seule catégorie (cadran OT du tableau de bord : plus que le chiffre du
 * centre, sans anneau autour).
 *
 * D'où deux cercles concentriques dans un même chemin, le trou étant creusé par
 * `fill-rule: evenodd`. Chaque cercle est tracé en deux demi-arcs, seule façon
 * d'obtenir un cercle entier avec la commande `A`.
 */
export function anneauComplet(
  cx: number,
  cy: number,
  rExt: number,
  rInt: number,
) {
  const cercle = (r: number) =>
    [
      `M${fmt(cx)} ${fmt(cy - r)}`,
      `A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx)} ${fmt(cy + r)}`,
      `A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx)} ${fmt(cy - r)}`,
      'Z',
    ].join(' ')
  return `${cercle(rExt)} ${cercle(rInt)}`
}

// ── Donut : répartition angulaire des parts ──────────────────────────────────

/** Une part de donut prête à dessiner : son segment et ses deux angles. */
export interface PartDonut {
  seg: ChartSegment
  a0: number
  a1: number
  /** Part unique couvrant tout le tour → tracée comme un anneau, pas un secteur. */
  complet: boolean
}

/**
 * Répartit les segments sur les 360° du donut. Renvoie aussi le `total` des
 * valeurs actives : un total nul ou négatif signifie « rien à dessiner » (le
 * cadran gère alors sa propre disparition) et ne produit AUCUNE part — jamais de
 * division par zéro.
 */
export function calculerPartsDonut(
  segments: ChartSegment[],
  gapDeg: number,
): { total: number; parts: PartDonut[] } {
  const actifs = segments.filter((s) => s.value > 0)
  const total = actifs.reduce((acc, s) => acc + s.value, 0)
  if (total <= 0) return { total, parts: [] }

  // Espace angulaire APRÈS chaque part (= avant la suivante, cycliquement) : `gapDeg`
  // par défaut, mais 0 entre deux parts ADJACENTES d'un même `group` (non vide) →
  // elles se collent pour se lire comme une seule section subdivisée. Sans `group`
  // partout, on retombe sur un `gapDeg` uniforme (comportement historique).
  const n = actifs.length
  const gapApres = actifs.map((seg, i) => {
    const suivant = actifs[(i + 1) % n]
    const memeGroupe =
      seg.group != null && seg.group !== '' && seg.group === suivant?.group
    return memeGroupe ? 0 : gapDeg
  })

  const parts = actifs
    .map((seg, i) => {
      const span = (seg.value / total) * 360
      // Début = somme des parts précédentes (évite toute mutation en rendu).
      const debut = actifs
        .slice(0, i)
        .reduce((acc, s) => acc + (s.value / total) * 360, 0)
      // Chaque frontière contribue pour la moitié de son gap de part et d'autre :
      // avant cette part = gap APRÈS la précédente, après cette part = son propre gap.
      const gapAvant = gapApres[(i - 1 + n) % n] ?? gapDeg
      const a0 = debut + gapAvant / 2
      const a1 = debut + span - (gapApres[i] ?? gapDeg) / 2
      // Part unique : elle couvre le cercle entier, et se trace alors comme un
      // anneau (cf. `anneauComplet`) — pas comme un secteur, qui dégénérerait.
      return { seg, a0, a1, complet: n === 1 }
    })
    .filter((p) => p.complet || p.a1 > p.a0)

  return { total, parts }
}

// ── Sunburst : arbre pondéré → arcs concentriques ────────────────────────────

/**
 * Nœud d'un sunburst à 3 niveaux (domaine → famille → gamme). L'angle d'un nœud
 * est proportionnel à la somme des `poids` de ses feuilles. `couleur` est le
 * remplissage DÉJÀ RÉSOLU (teinte du domaine éclaircie selon la profondeur, et
 * modulée par la santé pour les feuilles) ; `statutLabel` complète l'infobulle,
 * `hachures` superpose un motif rayé (gammes réglementaires), `blink` fait clignoter
 * doucement (remplacé par un liséré statique sous `prefers-reduced-motion`).
 */
export interface SunburstNode {
  key: string
  label: string
  couleur: string
  poids: number
  statutLabel?: string
  hachures?: boolean
  blink?: boolean
  /**
   * Décalage radial vers l'extérieur (unités de viewBox) — effet « part éclatée » qui
   * fait ressortir un nœud appelant une action (les autres restent collés à l'anneau).
   * La marge de bord de `RAYONS` réserve la place, sinon la part poussée serait rognée.
   */
  decalage?: number
  onClick?: () => void
  enfants?: SunburstNode[]
}

/** Somme des poids des feuilles d'un nœud (un nœud sans enfant est sa feuille). */
export function poidsFeuilles(node: SunburstNode): number {
  if (node.enfants && node.enfants.length > 0) {
    return node.enfants.reduce((acc, n) => acc + poidsFeuilles(n), 0)
  }
  return Math.max(node.poids, 0)
}

export interface Arc {
  node: SunburstNode
  depth: number
  a0: number
  a1: number
}

/** Répartit récursivement l'angle disponible entre les nœuds, par poids. */
export function disposer(
  nodes: SunburstNode[],
  angleDebut: number,
  spanTotal: number,
  poidsTotal: number,
  depth: number,
  acc: Arc[],
) {
  let curseur = angleDebut
  for (const node of nodes) {
    const poids = poidsFeuilles(node)
    const span = poidsTotal > 0 ? (poids / poidsTotal) * spanTotal : 0
    const a0 = curseur
    const a1 = curseur + span
    acc.push({ node, depth, a0, a1 })
    if (node.enfants && node.enfants.length > 0) {
      disposer(node.enfants, a0, span, poids, depth + 1, acc)
    }
    curseur = a1
  }
}
