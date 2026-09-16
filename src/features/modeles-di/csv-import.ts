import { parseCsvIndexe } from '@/lib/csv'

/** Séparateur imposé du CSV d'import (la virgule reste la décimale française). */
export const CSV_DELIMITER = ';'

const COL_LIBELLE = 'Libellé'
const COL_CONSTAT = 'Constat'

/** Modèle déjà en base, réduit à ce qu'il faut pour ne pas le recréer. */
export interface ModeleDiExistant {
  libelle: string
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Prompt prêt à coller dans n'importe quelle IA générative : décrit le CSV
 * EXACT attendu pour créer des modèles de demande d'intervention (un constat
 * type réutilisable). L'utilisateur colle ce prompt suivi de ses données
 * brutes (procédures, listes de pannes courantes, notes…), puis colle le CSV
 * obtenu dans le champ d'import.
 */
export function buildImportPrompt(params: {
  /** Modèles DÉJÀ enregistrés — l'IA ne doit pas les reproposer. */
  existants: ModeleDiExistant[]
  /** Périmètre d'écriture, pour le dire explicitement à l'IA. */
  portee: 'entreprise' | 'site'
  siteNom?: string | null
}): string {
  const { existants, portee, siteNom } = params
  const existantsTexte =
    existants.length > 0
      ? [
          ``,
          `Modèles DÉJÀ enregistrés (ne les remets PAS dans le CSV, même si tes données sources les mentionnent) :`,
          ...existants.map((m) => `- ${m.libelle}`),
        ]
      : []

  return [
    `Tu vas produire un fichier CSV pour créer des modèles de « demande d'intervention » dans une GMAO (gestion de maintenance).`,
    ``,
    `Un modèle de demande d'intervention est un constat type, prérempli, que l'utilisateur choisira au moment de signaler un problème (ex. « Fuite d'eau », « Éclairage en panne »). Chaque ligne du CSV = un modèle.`,
    ``,
    portee === 'entreprise'
      ? `Ces modèles seront communs à toute l'entreprise : reste générique, sans référence à un bâtiment précis.`
      : `Ces modèles seront propres au site${siteNom ? ` « ${siteNom} »` : ''}.`,
    ``,
    `Format EXACT attendu :`,
    `- Séparateur de colonnes : point-virgule ( ; )`,
    `- Encodage : UTF-8`,
    `- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre, puis une ligne par modèle.`,
    `- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.`,
    `- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).`,
    ``,
    `Colonnes :`,
    `- ${COL_LIBELLE} — obligatoire. Le nom court du modèle, tel qu'il apparaîtra dans la liste de choix (ex. « Fuite d'eau »). 200 caractères maximum, un libellé différent par ligne.`,
    `- ${COL_CONSTAT} — obligatoire. Le constat prérempli, rédigé à la première personne et au présent, qui décrit ce que l'utilisateur observe (ex. « Je constate une fuite d'eau. Merci de préciser l'emplacement exact et l'importance de la fuite. »). Une à trois phrases, 5000 caractères maximum.`,
    ...existantsTexte,
    ``,
    `Voici les données brutes à convertir (colle-les à la suite de ce message) :`,
    ``,
  ].join('\n')
}

export interface ModeleDiCsvRowOk {
  ok: true
  ligne: number
  libelle: string
  constat: string
}
export interface ModeleDiCsvRowKo {
  ok: false
  ligne: number
  erreurs: string[]
  /** Déjà en base (ou déjà plus haut dans le CSV) : non importée, sans être une erreur. */
  ignoree?: boolean
}
export type ModeleDiCsvRow = ModeleDiCsvRowOk | ModeleDiCsvRowKo

export interface ModeleDiCsvResult {
  colonnesManquantes: string[]
  lignes: ModeleDiCsvRow[]
}

/**
 * Parse + valide un CSV collé de modèles de DI : une ligne = un modèle
 * (libellé + constat). Un libellé déjà en base — ou déjà rencontré plus haut
 * dans le CSV — n'est pas recréé : la ligne est marquée « déjà en base »
 * (décision PO : on ne duplique jamais un modèle existant). Fonction PURE.
 */
export function parseImportCsv(
  texte: string,
  existants: ModeleDiExistant[] = [],
): ModeleDiCsvResult {
  const rows = parseCsvIndexe(texte, CSV_DELIMITER)
  if (rows.length === 0) return { colonnesManquantes: [], lignes: [] }

  const header = (rows[0]?.cellules ?? []).map((h) => h.trim())
  const indexOf = (nom: string) =>
    header.findIndex((h) => norm(h) === norm(nom))
  const idxLibelle = indexOf(COL_LIBELLE)
  const idxConstat = indexOf(COL_CONSTAT)

  const colonnesManquantes: string[] = []
  if (idxLibelle === -1) colonnesManquantes.push(COL_LIBELLE)
  if (idxConstat === -1) colonnesManquantes.push(COL_CONSTAT)
  if (colonnesManquantes.length > 0) return { colonnesManquantes, lignes: [] }

  // Libellés déjà pris : ceux de la base, enrichis au fil du CSV pour qu'une
  // même ligne répétée deux fois ne crée pas deux modèles.
  const dejaPris = new Set(existants.map((m) => norm(m.libelle)))

  const lignes: ModeleDiCsvRow[] = rows.slice(1).map((enr) => {
    // `ligne` = numéro dans le TEXTE COLLÉ (1 = en-tête) : les lignes
    // blanches, écartées par le lecteur, ne le décalent pas.
    const { cellules: cells, ligne } = enr
    const erreurs: string[] = []
    const libelle = (cells[idxLibelle] ?? '').trim()
    const constat = (cells[idxConstat] ?? '').trim()

    if (libelle === '') erreurs.push(`${COL_LIBELLE} est obligatoire.`)
    else if (libelle.length > 200)
      erreurs.push(`${COL_LIBELLE} dépasse 200 caractères.`)
    if (constat === '') erreurs.push(`${COL_CONSTAT} est obligatoire.`)
    else if (constat.length > 5000)
      erreurs.push(`${COL_CONSTAT} dépasse 5000 caractères.`)

    if (erreurs.length > 0) return { ok: false, ligne, erreurs }

    if (dejaPris.has(norm(libelle))) {
      return {
        ok: false,
        ligne,
        ignoree: true,
        erreurs: [`« ${libelle} » existe déjà — ligne ignorée.`],
      }
    }
    dejaPris.add(norm(libelle))
    return { ok: true, ligne, libelle, constat }
  })

  return { colonnesManquantes: [], lignes }
}
