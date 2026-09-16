import { z } from 'zod'

/**
 * Textes d'IDENTITÉ (nom, titre, libellé, référence, constat, motif) dans les
 * schémas Zod : ils doivent contenir au moins un caractère VISIBLE.
 *
 * `z.string().trim().min(1)` ne suffit pas. Le `trim()` de JavaScript ne retire
 * que les blancs au sens ECMAScript (espace, tabulation, saut de ligne,
 * insécable U+00A0, BOM U+FEFF) : il laisse intacts l'espace de largeur nulle
 * U+200B, les joignoirs U+200C/U+200D, le gluon de mots U+2060, l'inversion du
 * sens d'écriture U+202E… Le `trim()` de PostgreSQL est encore plus étroit (il
 * ne retire que l'espace ASCII), donc les CHECK `length(trim(nom)) > 0` de la
 * base ne rattrapent rien non plus.
 *
 * Résultat, avant ce contrôle : une ligne au nom INVISIBLE — introuvable en
 * recherche, et une entrée vide dans le sélecteur de site.
 *
 * Portée VOLONTAIREMENT étroite : seul est refusé le texte ENTIÈREMENT composé
 * d'invisibles. Une espace fine insécable à l'intérieur d'un nom légitime
 * (« Bâtiment A », « 15 h ») reste acceptée — c'est une typographie française
 * correcte, pas une saisie fautive. Le détourage (`.trim()`) n'est pas élargi
 * pour la même raison : on ne réécrit pas ce que l'utilisateur a tapé.
 */

/**
 * Un caractère qui n'est ni un blanc ECMAScript (`\s`, insécables compris), ni
 * un caractère de contrôle (`Cc`), ni un caractère de formatage (`Cf` : largeur
 * nulle, joignoirs, marques de sens). Autrement dit : quelque chose qui se voit.
 */
const CARACTERE_VISIBLE = /[^\s\p{Cc}\p{Cf}]/u

/** `true` si le texte comporte au moins un caractère qui se voit à l'écran. */
export function estLisible(valeur: string): boolean {
  return CARACTERE_VISIBLE.test(valeur)
}

/**
 * Sujets connus, avec leur démonstratif et leur article accordés : le message
 * parle DU champ que l'utilisateur regarde, pas d'un « texte » abstrait.
 */
const SUJETS = {
  nom: ['Ce nom', 'un nom'],
  titre: ['Ce titre', 'un titre'],
  libelle: ['Ce libellé', 'un libellé'],
  reference: ['Cette référence', 'une référence'],
  constat: ['Ce constat', 'un constat'],
  motif: ['Ce motif', 'un motif'],
} as const satisfies Record<string, readonly [string, string]>

export type SujetTexte = keyof typeof SUJETS

/**
 * Message EXPLICATIF : l'utilisateur voit un champ qui a l'air rempli. « Le nom
 * est obligatoire » serait aussi opaque que le caractère qu'on lui reproche —
 * il faut lui dire ce que contient réellement sa saisie, puis quoi faire.
 */
export function messageIllisible(sujet: SujetTexte): string {
  const [ce, un] = SUJETS[sujet]
  return `${ce} ne contient que des espaces ou des caractères invisibles. Saisissez ${un} lisible.`
}

/**
 * Champ texte d'identité OBLIGATOIRE : refuse le vide (avec le message métier
 * fourni, qui dit DE QUEL champ il s'agit), puis le texte entièrement
 * invisible. La borne de longueur reste à l'appelant : elle varie d'un champ à
 * l'autre (`.max(200)`, `.max(4000)`…) et se chaîne après.
 */
export function texteObligatoire(
  messageVide: string,
  sujet: SujetTexte = 'nom',
): z.ZodString {
  return (
    z
      .string()
      .trim()
      .min(1, messageVide)
      // `v === ''` est déjà signalé par le `.min(1)` ci-dessus : sans cette
      // échappée, un champ laissé vide porterait DEUX messages d'erreur.
      .refine((v) => v === '' || estLisible(v), messageIllisible(sujet))
  )
}
