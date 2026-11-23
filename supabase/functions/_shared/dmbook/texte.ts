/**
 * Porté depuis poc-dmbook.local/nettoyage.ts (import + réalignement du 19-20/11/2026).
 * Nettoyage du constat (consignes PO du 19/11/2026) :
 *   - pas le numéro de chambre en tête (il est déjà le lieu de la demande) ;
 *   - pas d'initiales / signature en fin (« //AB », « / alb », « - EW », « /cbs+ah ») ;
 *   - texte propre : espaces, ponctuation pendante, « # » de tête, majuscule initiale.
 * Ne retire JAMAIS un numéro cité au milieu d'une phrase.
 * Attention : « KC » = « cassé » (« pied de lit KC »), ce n'est PAS une signature.
 */

// Chambre de l'hôtel : étage 1 à 6, numéro 01 à 31 (101…631).
export const CHAMBRE = '[1-6](?:0[1-9]|[12]\\d|3[01])'
export const TETE_CHAMBRES = new RegExp(`^(?:\\s*(?:chambre\\s*)?#?\\s?${CHAMBRE}(?![\\dh]|\\/(?!\\s?${CHAMBRE}(?!\\d))|:\\d|[.,]\\d|\\s?(?:°|%|€|cm|mm|kg|min|euros?\\b))\\s*(?:[-,/+&:]|et\\b)?\\s*)+`, 'i')
export const UNE_CHAMBRE = new RegExp(CHAMBRE, 'g')

// Initiales vues après une barre oblique dans les tickets Dmbook (relevé du 19/11/2026).
// Sans barre, on n'accepte que celles-ci, en MAJUSCULES (ou « - ew »), pour ne
// jamais couper un vrai mot (« HS », « WC », « TV », « OK », « PB », « KC »…).
const INITIALES_SANS_BARRE = /(?:^|\s+|\s*[-–.]\s*|\s*\+\s*)(YF|JD|TL|AH|EW|LFG|LIC|CBS|ALB|YS|AB|MR|VB|FA|EB|FH|LF|JR|CV|SG|ND|KL|TG|LL|LUC|BL|MV|JG|EP|PLB|QD|ALD|AXH|LP|LC|YD|LG|-\s*ew)\s*$/
const SIGNATURE_BARRE = /\s*[\/\\]{1,3}\s*[A-Za-zÀ-ÿ.]{1,6}(?:\s*\+\s*[A-Za-zÀ-ÿ]{1,6})*[\s\/\\]*$/
const SMILEY_FIN = /\s*(?::-?\)|:-?\(|;-?\)|:D|:p)\s*$/i
const BARRES_FIN = /[\s\/\\]+$/

export function retirerSignature(texte: string): string {
  let s = texte.trim()
  for (let i = 0; i < 6; i++) {
    const avant = s
    s = s
      .replace(/\s*[\/\\]{1,3}\s*[A-Za-z]{2,4}\s*-\s*(\d{2}\/\d{2}\/\d{4})\s*$/, ' $1') // « /FH - 04/02/2022 » → « 04/02/2022 »
      .replace(SMILEY_FIN, '').replace(SIGNATURE_BARRE, '').replace(INITIALES_SANS_BARRE, '').replace(BARRES_FIN, '').trim()
    if (s === avant) break
  }
  return s
}

/**
 * @param chambresLiees numéros des chambres rattachées à la demande : on ne retire
 *   la tête que si TOUTES ses chambres sont bien rattachées (sinon on perdrait le lieu).
 */
export function nettoyerConstat(texte: string, chambresLiees: Set<string>): string {
  const brut = texte.trim()
  let s = retirerSignature(brut)
  const tete = s.match(TETE_CHAMBRES)
  if (tete) {
    const ch = [...new Set(tete[0].match(UNE_CHAMBRE) ?? [])]
    const reste = s.slice(tete[0].length).replace(/^[\s\-–:,.;/+]+/, '')
    if (ch.length && ch.every((c) => chambresLiees.has(c)) && reste.length >= 2) s = reste
  }
  s = s
    .replace(/^#\s?(?=[A-Za-zÀ-ÿ]|[1-6](?!\d)|\d{2}(?!\d))/, '')
    .replace(/[^\S\n]+/g, ' ') // espaces repliés, mais le retour à la ligne titre / corps est gardé
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[\s\-–,;:/+]+$/, '')
    .trim()
  if (s.length < 2) s = retirerSignature(brut) || brut
  return s.charAt(0).toLocaleUpperCase('fr-FR') + s.slice(1)
}

/** Un constat sans aucune lettre (« 515 », « #204 ») devient « Sans description » (décision PO 20/11/2026). */
export function constatOuSansDescription(constat: string): string {
  return /[a-zà-ÿ]/i.test(constat) ? constat : 'Sans description'
}

/** Normalisation commune aux empreintes : espaces repliés, bords retirés. */
export const normaliser = (s: string) => s.replace(/\s+/g, ' ').trim()

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Empreinte côté Dmbook : texte de la fiche (titre h2 + corps, cf. client.detail) + statut. */
export const empreinteDmbook = (texte: string, statut: string) => sha256(`${normaliser(texte)}|${statut}`)

/** Empreinte côté Dédale : constat + chambres liées (triées) + statut (1/2/3). */
export const empreinteDedale = (constat: string, chambres: string[], statut: number) =>
  sha256(`${normaliser(constat)}|${[...chambres].sort().join(',')}|${statut}`)
