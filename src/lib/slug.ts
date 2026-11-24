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
  // Collision = un AUTRE frère (id différent) porte le même slug. L'index des
  // frères (slug → ids) est construit une fois par tableau : la boucle
  // « un appel par ligne » coûtait n × n `slugify` (4 071 DI → ~16 M, 8 s de gel
  // du tableau de bord, mesuré le 24/11/2026).
  const ids = indexDesFreres(siblings).get(s)
  const collision = ids?.some((id) => id !== obj.id) ?? false
  return collision ? `${s}~${obj.id.slice(0, 8)}` : s
}

/**
 * Index slug → ids des frères, mémorisé PAR TABLEAU (WeakMap : libéré avec lui).
 * La longueur sert de garde : un tableau allongé ou raccourci sur place est
 * réindexé. Les tableaux de frères viennent des requêtes (jamais modifiés en
 * place) ou sont construits à la volée (`[...liste, nouveau]`).
 */
const indexParTableau = new WeakMap<
  object,
  { taille: number; parSlug: Map<string, string[]> }
>()

function indexDesFreres(
  siblings: { nom: string; id: string }[],
): Map<string, string[]> {
  const deja = indexParTableau.get(siblings)
  if (deja?.taille === siblings.length) return deja.parSlug
  const parSlug = new Map<string, string[]>()
  for (const x of siblings) {
    const slug = slugify(x.nom)
    const ids = parSlug.get(slug)
    if (ids) ids.push(x.id)
    else parSlug.set(slug, [x.id])
  }
  indexParTableau.set(siblings, { taille: siblings.length, parSlug })
  return parSlug
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
