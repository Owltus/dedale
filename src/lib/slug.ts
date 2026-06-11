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
