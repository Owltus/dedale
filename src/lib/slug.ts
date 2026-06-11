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
 * non vide doivent prévoir un repli (cf. `segOf` côté Bibliothèque/Gammes).
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
  const collision = siblings.some(
    (x) => x.id !== obj.id && slugify(x.nom) === s,
  )
  return collision ? `${s}~${obj.id.slice(0, 8)}` : s
}
