/**
 * Texte libre d'un ticket Dmbook → constat + lieu(x) Dédale.
 *
 * Mêmes règles que l'import réaligné du 19-20/11/2026 (poc-dmbook.local/controle.ts) :
 *   1. chambres écrites EN TÊTE (« #403 #404 odeur… ») → ces chambres ;
 *   2. sinon chambres citées dans le texte → ces chambres, SAUF citation ambiguë
 *      (clés, cartes de sécu, Saflok, « entre / devant / en face ») → aucun lieu
 *      (règle PO 20/11 : « si c'est ambigu, n'indique pas le lieu ») ;
 *   3. sinon mots-clés de parties communes (communs.ts) ;
 *   4. sinon aucun lieu (demande orpheline, le lieu se choisit dans Dédale).
 * Les cas particuliers historiques (CAS_PARTICULIERS, ORPHELINS de controle.ts) ne
 * sont PAS ici : ils sont protégés par l'empreinte tant que le texte ne change pas.
 */
import { lireCommun } from './communs.ts'
import { CHAMBRE, constatOuSansDescription, nettoyerConstat, UNE_CHAMBRE } from './texte.ts'

// Tête de chambres telle que l'import l'a lue pour décider des LIEUX (lieux.ts du prototype).
const TETE_LIEUX = new RegExp(`^(?:\\s*#?\\s?${CHAMBRE}(?![\\d/:h])\\s*(?:[-,/+]|et\\b)?\\s*)+`, 'i')
const SIGNATURE = /\s*\/{1,3}\s*([A-Za-zÀ-ÿ]{2,4})\s*$/

/** Chambres écrites en tête du texte, dans l'ordre, sans doublon. */
export function chambresEnTete(texte: string): string[] {
  const reste = texte.trim().replace(SIGNATURE, '').trim()
  const tete = reste.match(TETE_LIEUX)
  return tete ? [...new Set(tete[0].match(UNE_CHAMBRE) ?? [])] : []
}

/** Chambres citées n'importe où : « #508 », « la #304 », « en 413 », « chambre 629 ». */
const CITEE = /(?:#\s?|\bchambre\s+#?|\b(?:en|la|de la|du)\s+#?)([1-6](?:0[1-9]|[12]\d|3[01]))(?!\d)/gi
// Numéro nu (« 505 // 202 ») : retenu SEULEMENT s'il est une chambre connue et pas une mesure.
const NU = /(?<![\d\/.,:-])([1-6](?:0[1-9]|[12]\d|3[01]))(?![\d\/.,:]|\s?(?:°|%|€|h\b|min|cm|mm|m\b|kg|l\b|w\b|v\b|euros?))/gi
export function chambresDansLeTexte(texte: string, connues?: Set<string>): string[] {
  const citees = [...texte.matchAll(CITEE)].map((m) => m[1])
  const nues = connues ? [...texte.matchAll(NU)].map((m) => m[1]).filter((c) => connues.has(c)) : []
  return [...new Set([...citees, ...nues])]
}

export const CITATION_AMBIGUE = /\bcl(?:[ée]{1,2}s?|efs?)(?![a-zà-ÿ])|carte(s)? de (s[ée]cu|chambre)|saflo|entre (la )?(chambre )?#?\s?\d{3}|\bdevant\b|en face/i

/** Un local Dédale du site lié à Dmbook. `niveau` = nom du niveau (« R+1 »…). */
export type Local = { id: string; nom: string; niveau: string }

export type Analyse = {
  constat: string
  /** Locaux retenus (ids). Vide = demande orpheline. */
  lieux: string[]
  /** Chambres retenues (« 112 »). */
  chambres: string[]
  /** D'où vient le lieu. `ambigu` = chambres citées mais écartées par prudence. */
  source: 'tete' | 'citee' | 'commun' | 'ambigu' | 'aucun'
}

/** Numéro d'un local nommé exactement « Chambre NNN » (« 112 »), sinon null. */
export const chambreDuNom = (nom: string) => nom.match(/^Chambre (\d{3})$/)?.[1] ?? null

export class Locaux {
  readonly chambres = new Map<string, Local>()
  constructor(readonly liste: Local[]) {
    for (const l of liste) {
      const c = chambreDuNom(l.nom)
      if (c) this.chambres.set(c, l)
    }
  }
  /** Local commun par nom (+ niveau) — seulement s'il est unique. */
  commun(nom: string, niveau?: string): Local | undefined {
    const ok = this.liste.filter((l) => l.nom === nom && (!niveau || l.niveau === niveau))
    return ok.length === 1 ? ok[0] : undefined
  }
}

export function analyser(texte: string, locaux: Locaux): Analyse {
  const brut = texte.trim()
  const connues = new Set(locaux.chambres.keys())
  let chambres = chambresEnTete(brut).filter((c) => connues.has(c))
  let source: Analyse['source'] = chambres.length ? 'tete' : 'aucun'
  const lieux: string[] = []
  if (!chambres.length) {
    const citees = chambresDansLeTexte(brut, connues).filter((c) => connues.has(c)) // « #515 » : chambre inexistante → ignorée
    if (citees.length) {
      if (CITATION_AMBIGUE.test(brut)) source = 'ambigu'
      else { chambres = citees; source = 'citee' }
    } else {
      const co = lireCommun(brut)
      const l = co && locaux.commun(co.nom, co.niveau)
      if (l) { lieux.push(l.id); source = 'commun' }
    }
  }
  for (const c of chambres) lieux.push(locaux.chambres.get(c)!.id)
  let constat = constatOuSansDescription(nettoyerConstat(brut, new Set(chambres)))
  if (constat.length > 5000) constat = constat.slice(0, 4990) + ' […]'
  return { constat, lieux, chambres, source }
}
