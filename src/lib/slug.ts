/**
 * Slugifie un libellé pour l'URL : décompose les caractères accentués (NFD),
 * retire les diacritiques, passe en minuscules, remplace toute suite de
 * caractères hors `[a-z0-9]` par un tiret, puis élague les tirets de bordure.
 * Réutilisable (catégories, sous-catégories, gammes…).
 *
 * Ex. « Sécurité incendie » → `securite-incendie`, « Visite annuelle » →
 * `visite-annuelle`.
 *
 * Contrat : PEUT renvoyer `''` quand le libellé ne contient aucun caractère
 * `[a-z0-9]` (ex. « ### », « ① »). Les appelants qui ont besoin d'un segment
 * non vide doivent prévoir un repli (cf. `segOfUnique`, défini ci-dessous).
 */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Segment d'URL STABLE et UNIQUE PARMI SES FR\u00c8RES (cat\u00e9gorie, sous-cat\u00e9gorie,
 * gamme, mod\u00e8le\u2026) : son nom slugifi\u00e9, d\u00e9sambigu\u00efs\u00e9 en cas de collision entre
 * fr\u00e8res. R\u00e9utilisable par tout onglet de la Biblioth\u00e8que qui porte sa
 * navigation dans le chemin d'URL.
 *
 * Deux replis sur l'unicit\u00e9 :
 *  - slug VIDE (nom fait uniquement de caract\u00e8res hors `[a-z0-9]`, ex. \u00ab ### \u00bb,
 *    \u00ab \u2460 \u00bb) \u2192 `''` : ce segment vide dispara\u00eetrait du chemin (`join('/')` +
 *    `split('/').filter(Boolean)`) et l'\u00e9l\u00e9ment se r\u00e9soudrait vers son PARENT.
 *    On retombe sur l'`id` (toujours non vide et unique) ;
 *  - COLLISION entre fr\u00e8res (deux \u00e9l\u00e9ments de m\u00eame parent au slug non vide
 *    identique, ex. \u00ab \u00c9lectricit\u00e9 \u00bb / \u00ab Electricite \u00bb \u2192 `electricite`) : sans
 *    discriminant, la g\u00e9n\u00e9ration produit le m\u00eame segment pour les deux et la
 *    r\u00e9solution (`find`) renvoie toujours le 1er \u2192 le 2e devient injoignable.
 *    On suffixe alors `~<id court>` (le `~` est hors de l'alphabet de `slugify`,
 *    qui ne garde que `[a-z0-9-]`, donc jamais de confusion slug/discriminant).
 *    L'id court fait 8 caractères, allongé seulement si un homonyme partage
 *    ces 8 caractères. Un slug qui s'écrit comme l'id d'un frère non
 *    slugifiable (repli ci-dessus) compte aussi comme une collision.
 *
 * \u00c0 utiliser \u00c0 LA FOIS en G\u00c9N\u00c9RATION et en R\u00c9SOLUTION, avec EXACTEMENT le m\u00eame
 * ensemble de `siblings` de chaque c\u00f4t\u00e9 (sym\u00e9trie) : un segment doit toujours se
 * relire \u00e0 l'identique. Slug non vide et sans collision \u2192 segment = slug pur.
 */
export function segOfUnique(
  obj: { nom: string; id: string },
  siblings: { nom: string; id: string }[],
): string {
  const s = slugify(obj.nom)
  if (!s) return obj.id
  // Collision = un AUTRE frère (id différent) produirait le même segment : même
  // slug, OU repli sur un id qui s'écrit exactement comme ce slug (un uuid est
  // un slug valide). L'index des frères (segment → frères) est construit une
  // fois par tableau : la boucle « un appel par ligne » coûtait n × n `slugify`
  // (4 071 DI → ~16 M, 8 s de gel du tableau de bord, mesuré le 24/11/2026).
  const autres = (indexDesFreres(siblings).get(s) ?? []).filter(
    (f) => f.id !== obj.id,
  )
  if (autres.length === 0) return s
  // Discriminant : 8 caractères d'id (forme historique des liens partagés),
  // allongé SEULEMENT si un homonyme suffixé partage ces 8 caractères — sinon
  // les deux recevraient le même segment et le 2e serait injoignable.
  const homonymes = autres.filter((f) => f.parSlug).map((f) => f.id)
  let longueur = 8
  while (
    longueur < obj.id.length &&
    homonymes.some((id) => id.startsWith(obj.id.slice(0, longueur)))
  ) {
    longueur++
  }
  return `${s}~${obj.id.slice(0, longueur)}`
}

/**
 * Index slug → ids des frères, mémorisé PAR TABLEAU (WeakMap : libéré avec lui).
 * La longueur sert de garde : un tableau allongé ou raccourci sur place est
 * réindexé. Les tableaux de frères viennent des requêtes (jamais modifiés en
 * place) ou sont construits à la volée (`[...liste, nouveau]`).
 */
/**
 * Frère rangé sous le segment qu'il produirait SANS désambiguïsation : son slug
 * (`parSlug`), ou son id quand son slug est vide (repli de `segOfUnique`).
 */
interface Frere {
  id: string
  parSlug: boolean
}

const indexParTableau = new WeakMap<
  object,
  { taille: number; parSegment: Map<string, Frere[]> }
>()

function indexDesFreres(
  siblings: { nom: string; id: string }[],
): Map<string, Frere[]> {
  const deja = indexParTableau.get(siblings)
  if (deja?.taille === siblings.length) return deja.parSegment
  const parSegment = new Map<string, Frere[]>()
  for (const x of siblings) {
    const slug = slugify(x.nom)
    const cle = slug || x.id
    const frere = { id: x.id, parSlug: slug !== '' }
    const freres = parSegment.get(cle)
    if (freres) freres.push(frere)
    else parSegment.set(cle, [frere])
  }
  indexParTableau.set(siblings, { taille: siblings.length, parSegment })
  return parSegment
}

/**
 * Lien d'une entité SANS connaître ses frères : `slug~<id court>` (ou l'id si
 * le slug est vide). C'est la forme que `segOfUnique` donne en cas de
 * collision ; la fiche détail l'accepte toujours (`resoudreAlias`) puis remet
 * l'URL sous sa forme canonique. Sert aux aperçus partiels (tableau de bord)
 * qui n'ont chargé qu'une partie de la liste.
 */
export function segAlias(obj: { nom: string; id: string }): string {
  const s = slugify(obj.nom)
  return s ? `${s}~${obj.id.slice(0, 8)}` : obj.id
}

/**
 * Retrouve l'entité désignée par un lien `segAlias` : même slug de nom ET id
 * qui commence par le discriminant. `null` si le segment n'a pas cette forme
 * ou ne désigne rien.
 */
export function resoudreAlias<T>(
  seg: string,
  items: readonly T[],
  identity: (item: T) => { nom: string; id: string },
): T | null {
  const i = seg.lastIndexOf('~')
  if (i <= 0) return null
  const base = seg.slice(0, i)
  const court = seg.slice(i + 1)
  if (court.length !== 8) return null
  return (
    items.find((item) => {
      const { nom, id } = identity(item)
      return id.startsWith(court) && slugify(nom) === base
    }) ?? null
  )
}

/** Discriminant d'un lien `segAlias` : 8 caractères hexadécimaux. */
const COURT_HEX = /^[0-9a-f]{8}$/

/**
 * Découpe un lien `slug~id court` en `{ base, court }` ; `null` si le segment
 * n'a pas cette forme (slug pur, uuid complet…).
 */
export function partiesAlias(
  seg: string,
): { base: string; court: string } | null {
  const i = seg.lastIndexOf('~')
  if (i <= 0) return null
  const court = seg.slice(i + 1)
  if (!COURT_HEX.test(court)) return null
  return { base: seg.slice(0, i), court }
}

/**
 * Bornes d'uuid couvrant tous les ids qui commencent par `court` (8 hex) :
 * l'ordre des uuid suit celui de leur écriture hexadécimale, donc une lecture
 * d'intervalle sur la clé primaire.
 */
export function bornesUuid(court: string): [string, string] {
  return [
    `${court}-0000-0000-0000-000000000000`,
    `${court}-ffff-ffff-ffff-ffffffffffff`,
  ]
}
