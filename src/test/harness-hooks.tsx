/**
 * Harnais PARTAGÉ des tests de hooks (suite « Martin ») : identifiants stables,
 * générateurs fast-check de jeux d'entités et d'arbres de catégories, et petits
 * outils de construction de chemins d'URL.
 *
 * Aucun fichier de production ne dépend de ce module : il n'existe que pour les
 * fichiers `*.dom.test.tsx`.
 */
import fc from 'fast-check'
import { segOfUnique } from '@/lib/slug'

/** Entité minimale résolue par slug (cf. `segOfUnique`). */
export interface Entite {
  id: string
  nom: string
}

/** Nœud de catégorie minimal (cf. `TreeNode`). */
export interface Categorie extends Entite {
  parent_id: string | null
}

/**
 * UUID déterministe, unique DÈS SES 8 PREMIERS CARACTÈRES : c'est la tranche que
 * `segOfUnique` utilise comme discriminant (`~<id court>`), donc la seule qui doit
 * être distincte pour que les segments d'une fratrie le soient aussi.
 */
export function idAt(i: number): string {
  return `${i.toString(16).padStart(8, '0')}-1111-2222-3333-444444444444`
}

/**
 * Noms « du monde réel » ET pathologiques : homonymes exacts, homonymes après
 * retrait des accents (collision de slug), noms vides, noms sans aucun caractère
 * `[a-z0-9]` (slug vide → repli sur l'id), noms très longs, unicode arbitraire.
 */
export const nomArb: fc.Arbitrary<string> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.constantFrom(
      'Pompe',
      'Pompe',
      'Électricité',
      'Electricite',
      'CVC / Froid',
      'Niveau 2',
      'Local B12',
      '',
      '###',
      '①',
      '   ',
      '~tilde~',
      'a'.repeat(300),
    ),
  },
  { weight: 2, arbitrary: fc.string() },
  { weight: 1, arbitrary: fc.string({ unit: 'grapheme' }) },
)

/** Fratrie arbitraire (1 à 6 entités), ids distincts par construction. */
export const entitesArb: fc.Arbitrary<Entite[]> = fc
  .array(nomArb, { minLength: 1, maxLength: 6 })
  .map((noms) => noms.map((nom, i) => ({ id: idAt(i), nom })))

/**
 * Arbre de catégories arbitraire : le parent d'un nœud est toujours un nœud
 * d'index STRICTEMENT inférieur → forêt acyclique, comme en base (FK + garde-fou
 * anti-cycle).
 */
export const arbreArb: fc.Arbitrary<Categorie[]> = fc
  .array(
    fc.record({
      nom: nomArb,
      parent: fc.option(fc.nat({ max: 15 }), { nil: null }),
    }),
    { minLength: 1, maxLength: 10 },
  )
  .map((bruts) =>
    bruts.map((brut, i) => ({
      id: idAt(i),
      nom: brut.nom,
      parent_id: brut.parent === null || i === 0 ? null : idAt(brut.parent % i),
    })),
  )

/** Un pas de chemin d'URL : soit un vrai enfant du palier courant, soit un parasite. */
export type Pas =
  | { type: 'enfant'; k: number }
  | { type: 'parasite'; seg: string }

/** Segments parasites : vides, exotiques, très longs, ou carrément arbitraires. */
export const segParasiteArb: fc.Arbitrary<string> = fc.oneof(
  fc.constantFrom(
    '',
    '..',
    '.',
    '%20',
    'inexistant',
    '~',
    'électricité',
    '__non_classe__',
    'x'.repeat(2000),
  ),
  fc.string(),
)

export const pasArb: fc.Arbitrary<Pas> = fc.oneof(
  fc.record({ type: fc.constant('enfant' as const), k: fc.nat({ max: 12 }) }),
  fc.record({
    type: fc.constant('parasite' as const),
    seg: segParasiteArb,
  }),
)

/** Segment d'une catégorie calculé sur SES frères (symétrie `segOfUnique`). */
export function segDeCategorie<T extends Categorie>(cat: T, cats: T[]): string {
  return segOfUnique(
    cat,
    cats.filter((x) => x.parent_id === cat.parent_id),
  )
}

/** Segments d'une chaîne racine → feuille (ce que produit `goTo`). */
export function segsDeChaine<T extends Categorie>(
  chaine: T[],
  cats: T[],
): string[] {
  return chaine.map((c) => segDeCategorie(c, cats))
}

/**
 * Descend l'arbre en suivant des index de frères (modulo) : renvoie la chaîne
 * réellement empruntée, donc TOUJOURS valide (racine → feuille).
 */
export function chaineReelle<T extends Categorie>(
  cats: T[],
  choix: number[],
): T[] {
  const chaine: T[] = []
  let parentId: string | null = null
  for (const k of choix) {
    const fratrie = cats.filter((c) => c.parent_id === parentId)
    if (fratrie.length === 0) break
    const enfant = fratrie[k % fratrie.length]
    if (enfant === undefined) break
    chaine.push(enfant)
    parentId = enfant.id
  }
  return chaine
}

/**
 * Traduit une suite de pas en segments d'URL : un pas « enfant » pose le segment
 * réel du k-ième frère du dernier palier ENCORE valide, un pas « parasite » pose
 * un segment quelconque. Produit donc aussi bien des chemins entièrement valides
 * que tronqués, désordonnés ou trop longs.
 */
export function segsDepuisPas(cats: Categorie[], pas: Pas[]): string[] {
  const segs: string[] = []
  let parentId: string | null = null
  let coupe = false
  for (const p of pas) {
    if (p.type === 'parasite') {
      segs.push(p.seg)
      coupe = true
      continue
    }
    const fratrie = cats.filter((c) => c.parent_id === parentId)
    const enfant = fratrie[p.k % Math.max(1, fratrie.length)]
    if (enfant === undefined) {
      segs.push('palier-inexistant')
      coupe = true
      continue
    }
    segs.push(segOfUnique(enfant, fratrie))
    if (!coupe) parentId = enfant.id
  }
  return segs
}
