import { parseCsv } from '@/lib/csv'
import type { Champ, ChampValeur } from '@/lib/champs'

/** Séparateur imposé du CSV d'import (virgule = décimale en France). */
export const CSV_DELIMITER = ';'

const COL_LOCAL = 'Local'
const COL_MISE_EN_SERVICE = 'Date de mise en service'
const COL_FIN_GARANTIE = 'Date de fin de garantie'

/** Local minimal nécessaire à la résolution « nom de local → local_id ». */
export interface LocalPourImport {
  local_id: string | null
  local_nom: string | null
  chemin_court: string | null
}

/**
 * Décrit la colonne d'un champ pour le prompt (une ligne d'instruction par
 * caractéristique du gabarit).
 */
function ligneChamp(c: Champ): string {
  const obligatoire = c.requis ? 'obligatoire' : 'optionnel'
  const defaut =
    c.defaut !== null && c.defaut !== ''
      ? ` (défaut : « ${String(c.defaut)} »)`
      : ''
  switch (c.type) {
    case 'liste':
      return `- ${c.cle} — ${obligatoire}${defaut}. UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : ${(c.options ?? []).map((o) => `« ${o} »`).join(', ')}.`
    case 'nombre':
      return `- ${c.cle} — ${obligatoire}${defaut}. Un nombre${c.unite ? ` en ${c.unite}` : ''}, virgule comme séparateur décimal (ex. « 6,5 »), sans l'unité dans la cellule.`
    case 'oui-non':
      return `- ${c.cle} — ${obligatoire}${defaut}. Écris exactement « Oui » ou « Non ».`
    case 'date':
      return `- ${c.cle} — ${obligatoire}${defaut}. Format JJ/MM/AAAA.`
    case 'texte':
    default:
      return `- ${c.cle} — ${obligatoire}${defaut}. Texte libre.`
  }
}

/**
 * Prompt prêt à coller dans n'importe quelle IA générative : décrit le CSV
 * EXACT attendu pour importer des équipements dans une sous-catégorie DÉJÀ
 * existante (gabarit déjà fixé — cf. échange avec le PO, la création d'un
 * gabarit depuis un CSV n'est volontairement pas couverte). L'utilisateur
 * colle ensuite ce prompt suivi de ses données brutes (PDF, tableau…) dans
 * l'IA de son choix, puis colle le CSV obtenu dans le champ d'import.
 */
export function buildImportPrompt(params: {
  sousCategorieNom: string
  champs: Champ[]
  /** Locaux du site actif — pour que l'IA fasse elle-même le rapprochement
   * sémantique (ex. « l'accueil » du document source → « Frontdesk » en
   * base) plutôt que de laisser l'app deviner après coup sur du texte brut. */
  locaux: LocalPourImport[]
  /** Équipements DÉJÀ enregistrés dans cette sous-catégorie — pour que l'IA
   * les exclue du CSV plutôt que de les recréer en double. */
  equipementsExistants: string[]
}): string {
  const { sousCategorieNom, champs, locaux, equipementsExistants } = params
  const colonnes = [
    `- ${COL_LOCAL} — obligatoire. Le nom EXACT d'un des locaux listés ci-dessous (liste « Locaux existants »). Si le document source utilise un autre nom pour le même endroit (synonyme, ancien nom, langue différente…), fais le rapprochement toi-même et recopie le nom tel qu'il apparaît dans la liste.`,
    ...champs.map(ligneChamp),
    `- ${COL_MISE_EN_SERVICE} — optionnel. Format JJ/MM/AAAA.`,
    `- ${COL_FIN_GARANTIE} — optionnel. Format JJ/MM/AAAA.`,
  ].join('\n')

  const locauxTexte =
    locaux.length > 0
      ? locaux.map((l) => `- ${l.chemin_court ?? l.local_nom ?? ''}`).join('\n')
      : '(aucun local enregistré sur ce site pour l’instant)'

  const existantsTexte =
    equipementsExistants.length > 0
      ? [
          ``,
          `Équipements DÉJÀ enregistrés dans cette sous-catégorie (ne les remets PAS dans le CSV, même si le document source les mentionne — génère uniquement les équipements qui n'y figurent pas encore) :`,
          ...equipementsExistants.map((e) => `- ${e}`),
        ]
      : []

  return [
    `Tu vas produire un fichier CSV pour importer une liste d'équipements dans une GMAO (gestion de maintenance).`,
    ``,
    `Sous-catégorie d'équipements ciblée : « ${sousCategorieNom} ». Chaque ligne du CSV = un équipement de ce type.`,
    ``,
    `Format EXACT attendu :`,
    `- Séparateur de colonnes : point-virgule ( ; )`,
    `- Encodage : UTF-8`,
    `- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre, puis une ligne par équipement.`,
    `- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).`,
    ``,
    `Colonnes :`,
    colonnes,
    ``,
    `Locaux existants sur ce site (utilise EXACTEMENT un de ces noms dans la colonne ${COL_LOCAL}) :`,
    locauxTexte,
    ...existantsTexte,
    ``,
    `Voici les données brutes à convertir (colle-les à la suite de ce message) :`,
    ``,
  ].join('\n')
}

export interface CsvImportRowOk {
  ok: true
  ligne: number
  localId: string
  champs: Champ[]
  dateMiseEnService?: string
  dateFinGarantie?: string
  /** Doublon PROBABLE avec un équipement déjà en base (même local, cf.
   * `resoudreDoublon`) — n'empêche PAS l'import (l'IA a pu légitimement
   * échouer à exclure la ligne malgré la consigne), mais s'affiche comme un
   * avertissement dans l'aperçu pour que l'utilisateur tranche lui-même. */
  avertissement?: string
}
export interface CsvImportRowError {
  ok: false
  ligne: number
  erreurs: string[]
}
export type CsvImportRow = CsvImportRowOk | CsvImportRowError

export interface CsvImportResult {
  /** En-têtes manquants (champ requis du gabarit sans colonne dans le CSV). */
  colonnesManquantes: string[]
  lignes: CsvImportRow[]
}

const norm = (s: string) => s.trim().toLowerCase()

/** Convertit un JJ/MM/AAAA en ISO YYYY-MM-DD, ou `null` si invalide. */
function parseDateFr(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  if (!m) return null
  const [, jj, mm, aaaa] = m as unknown as [string, string, string, string]
  const j = Number(jj)
  const mo = Number(mm)
  const iso = `${aaaa}-${mo.toString().padStart(2, '0')}-${j.toString().padStart(2, '0')}`
  const d = new Date(iso)
  // Rejette les dates qui « débordent » (ex. 31/02) — Date les recale silencieusement.
  if (
    Number.isNaN(d.getTime()) ||
    d.getUTCFullYear() !== Number(aaaa) ||
    d.getUTCMonth() !== mo - 1 ||
    d.getUTCDate() !== j
  ) {
    return null
  }
  return iso
}

/** Résout un nom (ou chemin) de local vers un `local_id`, ou une erreur explicite. */
function resoudreLocal(
  valeur: string,
  locaux: LocalPourImport[],
): { ok: true; localId: string } | { ok: false; erreur: string } {
  const v = norm(valeur)
  if (v === '') return { ok: false, erreur: `${COL_LOCAL} est obligatoire.` }
  // 1) correspondance sur le CHEMIN (désambiguïsation explicite par l'utilisateur/l'IA).
  const parChemin = locaux.find(
    (l) => l.chemin_court !== null && norm(l.chemin_court) === v,
  )
  if (parChemin?.local_id) return { ok: true, localId: parChemin.local_id }
  // 2) correspondance sur le NOM SEUL, tolérée si non ambiguë.
  const parNom = locaux.filter(
    (l) => l.local_nom !== null && norm(l.local_nom) === v,
  )
  if (parNom.length === 1 && parNom[0]?.local_id) {
    return { ok: true, localId: parNom[0].local_id }
  }
  if (parNom.length > 1) {
    const chemins = parNom.map((l) => l.chemin_court ?? l.local_nom).join(', ')
    return {
      ok: false,
      erreur: `${COL_LOCAL} « ${valeur} » est ambigu (plusieurs locaux portent ce nom : ${chemins}) — utilise le chemin complet.`,
    }
  }
  return {
    ok: false,
    erreur: `${COL_LOCAL} « ${valeur} » introuvable sur ce site.`,
  }
}

/** Valide et convertit la valeur brute d'une cellule pour un champ du gabarit. */
function resoudreChamp(
  champ: Champ,
  brut: string | undefined,
): { ok: true; valeur: ChampValeur } | { ok: false; erreur: string } {
  const v = (brut ?? '').trim()
  if (v === '') {
    if (champ.requis) {
      return { ok: false, erreur: `« ${champ.cle} » est obligatoire.` }
    }
    return { ok: true, valeur: champ.defaut }
  }
  switch (champ.type) {
    case 'liste': {
      const option = (champ.options ?? []).find((o) => norm(o) === norm(v))
      if (!option) {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » n'est pas une valeur autorisée (${(champ.options ?? []).join(', ')}).`,
        }
      }
      return { ok: true, valeur: option }
    }
    case 'nombre': {
      const n = Number(v.replace(',', '.'))
      if (!Number.isFinite(n)) {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » n'est pas un nombre.`,
        }
      }
      return { ok: true, valeur: n }
    }
    case 'oui-non': {
      if (norm(v) === 'oui') return { ok: true, valeur: true }
      if (norm(v) === 'non') return { ok: true, valeur: false }
      return {
        ok: false,
        erreur: `« ${champ.cle} » : « ${v} » doit être « Oui » ou « Non ».`,
      }
    }
    case 'date': {
      const iso = parseDateFr(v)
      if (!iso) {
        return {
          ok: false,
          erreur: `« ${champ.cle} » : « ${v} » n'est pas une date valide (JJ/MM/AAAA).`,
        }
      }
      return { ok: true, valeur: iso }
    }
    case 'texte':
    default:
      return { ok: true, valeur: v }
  }
}

/** Équipement déjà en base, réduit à ce qu'il faut pour repérer un doublon probable. */
export interface EquipementExistantPourImport {
  localId: string | null
  /** Valeur du champ PRINCIPAL de la sous-catégorie pour cet équipement, si désignée. */
  principal: ChampValeur | undefined
  /** Libellé affiché (titre + identité), pour le message d'avertissement. */
  titre: string
}

/**
 * Repère un doublon PROBABLE : un équipement déjà en base au MÊME local. Si
 * la sous-catégorie désigne un champ principal et que la ligne CSV porte la
 * même valeur pour ce champ, le doublon est quasi certain (message précis) ;
 * sinon simple coïncidence de local, signalée plus prudemment. `undefined` =
 * rien de suspect. N'empêche jamais l'import (l'app ne fait QUE créer — le
 * risque n'est jamais la perte de données, seulement une création en trop
 * que l'utilisateur reste libre d'accepter ou de retirer du CSV).
 */
function resoudreDoublon(
  localId: string,
  champsResolus: Champ[],
  champPrincipalCle: string | null,
  existants: EquipementExistantPourImport[],
): string | undefined {
  const memeLocal = existants.filter((e) => e.localId === localId)
  if (memeLocal.length === 0) return undefined
  const principalCsv = champPrincipalCle
    ? champsResolus.find((c) => c.cle === champPrincipalCle)?.valeur
    : undefined
  const memeValeur =
    champPrincipalCle && principalCsv !== undefined && principalCsv !== null
      ? memeLocal.find(
          (e) => norm(String(e.principal ?? '')) === norm(String(principalCsv)),
        )
      : undefined
  if (memeValeur) {
    return `Doublon probable : « ${memeValeur.titre} » existe déjà à cet emplacement avec la même valeur.`
  }
  return `Un équipement existe déjà à cet emplacement (${memeLocal.map((e) => e.titre).join(', ')}) — vérifie qu'il ne s'agit pas d'un doublon.`
}

/**
 * Parse + valide un CSV collé pour l'import d'équipements dans une
 * sous-catégorie : une ligne = un équipement, résolu vers un `local_id` et
 * une liste de `Champ[]` (gabarit + valeurs) prête pour
 * `useCreateEquipementParc`. Ne modifie RIEN — pure fonction de lecture.
 */
export function parseImportCsv(
  texte: string,
  gabarit: Champ[],
  locaux: LocalPourImport[],
  champPrincipalCle: string | null = null,
  existants: EquipementExistantPourImport[] = [],
): CsvImportResult {
  const rows = parseCsv(texte, CSV_DELIMITER)
  if (rows.length === 0) return { colonnesManquantes: [], lignes: [] }

  const header = (rows[0] ?? []).map((h) => h.trim())
  const indexOf = (nom: string) =>
    header.findIndex((h) => norm(h) === norm(nom))

  const idxLocal = indexOf(COL_LOCAL)
  const idxMiseEnService = indexOf(COL_MISE_EN_SERVICE)
  const idxFinGarantie = indexOf(COL_FIN_GARANTIE)
  const idxChamps = gabarit.map((c) => ({ champ: c, idx: indexOf(c.cle) }))

  const colonnesManquantes: string[] = []
  if (idxLocal === -1) colonnesManquantes.push(COL_LOCAL)
  for (const { champ, idx } of idxChamps) {
    if (idx === -1) colonnesManquantes.push(champ.cle)
  }
  if (colonnesManquantes.length > 0) {
    return { colonnesManquantes, lignes: [] }
  }

  const lignes: CsvImportRow[] = rows.slice(1).map((cells, i) => {
    const ligne = i + 2 // 1 = en-tête, humain compte à partir de 1
    const erreurs: string[] = []

    const local = resoudreLocal(cells[idxLocal] ?? '', locaux)
    if (!local.ok) erreurs.push(local.erreur)

    const champsResolus: Champ[] = []
    for (const { champ, idx } of idxChamps) {
      const r = resoudreChamp(champ, cells[idx])
      if (!r.ok) {
        erreurs.push(r.erreur)
      } else {
        champsResolus.push({ ...champ, valeur: r.valeur })
      }
    }

    let dateMiseEnService: string | undefined
    if (idxMiseEnService !== -1) {
      const brut = (cells[idxMiseEnService] ?? '').trim()
      if (brut !== '') {
        const iso = parseDateFr(brut)
        if (!iso)
          erreurs.push(
            `${COL_MISE_EN_SERVICE} : « ${brut} » invalide (JJ/MM/AAAA).`,
          )
        else dateMiseEnService = iso
      }
    }
    let dateFinGarantie: string | undefined
    if (idxFinGarantie !== -1) {
      const brut = (cells[idxFinGarantie] ?? '').trim()
      if (brut !== '') {
        const iso = parseDateFr(brut)
        if (!iso)
          erreurs.push(
            `${COL_FIN_GARANTIE} : « ${brut} » invalide (JJ/MM/AAAA).`,
          )
        else dateFinGarantie = iso
      }
    }

    if (erreurs.length > 0 || !local.ok) return { ok: false, ligne, erreurs }
    return {
      ok: true,
      ligne,
      localId: local.localId,
      champs: champsResolus,
      dateMiseEnService,
      dateFinGarantie,
      avertissement: resoudreDoublon(
        local.localId,
        champsResolus,
        champPrincipalCle,
        existants,
      ),
    }
  })

  return { colonnesManquantes: [], lignes }
}
