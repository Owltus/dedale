import { NATURE_GAMME_LABEL, gammeNatures } from './schemas'
import { parseCsvIndexe } from '@/lib/csv'
import {
  COL_OPERATION,
  COL_OP_DESCRIPTION,
  COL_ORDRE,
  COL_SEUIL_MAX,
  COL_SEUIL_MIN,
  COL_TYPE,
  COL_UNITE,
  blocColonnesOperation,
  resoudreOperation,
  type OperationCsvResolue,
  type OperationRefs,
} from '@/features/operations/csv-import'

/** Séparateur imposé du CSV d'import (la virgule reste la décimale française). */
export const CSV_DELIMITER = ';'

const COL_GAMME = 'Gamme'
const COL_NATURE = 'Nature'
const COL_PERIODICITE = 'Périodicité'
const COL_GAMME_DESCRIPTION = 'Description de la gamme'

/** Périodicité du référentiel (`periodicites`). */
export interface PeriodiciteRef {
  id: number
  libelle: string
  jours_periodicite: number
}

/** Gamme déjà en base dans la sous-catégorie : complétée, jamais dupliquée. */
export interface GammeExistante {
  id: string
  nom: string
  /** Libellés des opérations déjà présentes — jamais réécrites. */
  operations: string[]
}

const norm = (s: string) => s.trim().toLowerCase()

/** Libellé de nature → valeur stockée (« Réglementaire » → `controle_reglementaire`). */
function resoudreNature(
  brut: string,
): (typeof gammeNatures)[number] | undefined {
  return gammeNatures.find(
    (n) => norm(NATURE_GAMME_LABEL[n]) === norm(brut) || n === norm(brut),
  )
}

/**
 * Prompt prêt à coller dans n'importe quelle IA générative : décrit le CSV
 * EXACT attendu pour construire un plan de maintenance (des gammes et leurs
 * opérations) dans la Bibliothèque. Une ligne = UNE opération ; le nom de la
 * gamme est répété sur chacune de ses lignes, ses caractéristiques (nature,
 * périodicité) n'étant lues que sur sa première ligne.
 */
export function buildImportPrompt(params: {
  sousCategorieNom: string
  refs: OperationRefs
  periodicites: PeriodiciteRef[]
  existants: GammeExistante[]
}): string {
  const { sousCategorieNom, refs, periodicites, existants } = params
  const existantsTexte =
    existants.length > 0
      ? [
          ``,
          `Gammes DÉJÀ enregistrées dans cette sous-catégorie. Ne les recrée pas à l'identique : ne les remets dans le CSV que s'il leur manque une opération (elle sera ajoutée ; leur nature et leur périodicité, elles, ne seront pas modifiées).`,
          ...existants.map(
            (g) =>
              `- ${g.nom}${
                g.operations.length > 0
                  ? ` (opérations déjà définies : ${g.operations.join(', ')})`
                  : ' (aucune opération)'
              }`,
          ),
        ]
      : []

  return [
    `Tu vas produire un fichier CSV pour construire un PLAN DE MAINTENANCE dans une GMAO (gestion de maintenance).`,
    ``,
    `Une gamme est une intervention récurrente (ex. « Vérification annuelle des extincteurs ») : elle a une nature, une périodicité, et contient les opérations à réaliser à chaque passage.`,
    ``,
    `Sous-catégorie ciblée : « ${sousCategorieNom} ». Toutes les gammes du CSV y seront rangées, dans la bibliothèque commune à l'entreprise.`,
    ``,
    `Format EXACT attendu :`,
    `- Séparateur de colonnes : point-virgule ( ; )`,
    `- Encodage : UTF-8`,
    `- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre.`,
    `- Ensuite UNE LIGNE PAR OPÉRATION. Le nom de la gamme est RÉPÉTÉ sur chacune de ses lignes, et ses lignes se suivent.`,
    `- Une gamme sans opération détaillée s'écrit sur une seule ligne, avec ${COL_OPERATION} et les colonnes suivantes vides.`,
    `- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.`,
    `- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).`,
    ``,
    `Colonnes :`,
    `- ${COL_GAMME} — obligatoire. Le nom de la gamme (ex. « Vérification annuelle des extincteurs »). Répété à l'identique sur toutes ses lignes.`,
    `- ${COL_NATURE} — obligatoire, sur la première ligne de la gamme. UNIQUEMENT une de ces valeurs : ${gammeNatures
      .map((n) => `« ${NATURE_GAMME_LABEL[n]} »`)
      .join(
        ', ',
      )}. « Réglementaire » = contrôle imposé par la réglementation ; « Maintenance » = entretien préventif choisi par l'exploitant.`,
    `- ${COL_PERIODICITE} — obligatoire, sur la première ligne de la gamme. UNIQUEMENT une de ces valeurs, recopiée EXACTEMENT : ${periodicites
      .map((p) => `« ${p.libelle} »`)
      .join(', ')}.`,
    `- ${COL_GAMME_DESCRIPTION} — optionnel. Une phrase décrivant la gamme. À ne remplir que sur la PREMIÈRE ligne de la gamme.`,
    ...blocColonnesOperation(refs),
    ...existantsTexte,
    ``,
    `Voici les données brutes à convertir (colle-les à la suite de ce message) :`,
    ``,
  ].join('\n')
}

export interface GammeCsvRowOk {
  ok: true
  ligne: number
  gamme: string
  nature?: (typeof gammeNatures)[number]
  periodiciteId?: number
  description?: string
  /** `null` = ligne d'une gamme sans opération détaillée. */
  operation: OperationCsvResolue | null
}
export interface GammeCsvRowKo {
  ok: false
  ligne: number
  erreurs: string[]
  ignoree?: boolean
}
export type GammeCsvRow = GammeCsvRowOk | GammeCsvRowKo

export interface GammeCsvResult {
  colonnesManquantes: string[]
  lignes: GammeCsvRow[]
}

/**
 * Parse + valide un CSV collé de gammes : une ligne = une opération, rattachée
 * à la gamme nommée sur la même ligne. Nature et périodicité ne sont exigées
 * que sur la PREMIÈRE ligne d'une gamme NOUVELLE (une gamme existante n'est
 * jamais modifiée, seulement complétée). Fonction PURE.
 */
export function parseImportCsv(
  texte: string,
  refs: OperationRefs,
  periodicites: PeriodiciteRef[],
  existants: GammeExistante[] = [],
): GammeCsvResult {
  const rows = parseCsvIndexe(texte, CSV_DELIMITER)
  if (rows.length === 0) return { colonnesManquantes: [], lignes: [] }

  const header = (rows[0]?.cellules ?? []).map((h) => h.trim())
  const indexOf = (nom: string) =>
    header.findIndex((h) => norm(h) === norm(nom))
  const idxGamme = indexOf(COL_GAMME)
  const idxNature = indexOf(COL_NATURE)
  const idxPeriodicite = indexOf(COL_PERIODICITE)
  const idxDescription = indexOf(COL_GAMME_DESCRIPTION)

  const colonnesManquantes: string[] = []
  if (idxGamme === -1) colonnesManquantes.push(COL_GAMME)
  if (idxNature === -1) colonnesManquantes.push(COL_NATURE)
  if (idxPeriodicite === -1) colonnesManquantes.push(COL_PERIODICITE)
  if (indexOf(COL_OPERATION) === -1) colonnesManquantes.push(COL_OPERATION)
  if (colonnesManquantes.length > 0) return { colonnesManquantes, lignes: [] }

  const gammesExistantes = new Map(existants.map((g) => [norm(g.nom), g]))
  // Opérations déjà prises par gamme (base + lignes précédentes du CSV).
  const opsParGamme = new Map<string, Set<string>>()
  for (const g of existants) {
    opsParGamme.set(norm(g.nom), new Set(g.operations.map(norm)))
  }
  // Gammes NOUVELLES déjà décrites plus haut : leur nature/périodicité n'est
  // lue qu'une fois, les lignes suivantes n'ont plus à la répéter.
  const nouvellesDecrites = new Set<string>()

  const lignes: GammeCsvRow[] = rows.slice(1).map((enr) => {
    // `ligne` = numéro dans le TEXTE COLLÉ (1 = en-tête) : les lignes
    // blanches, écartées par le lecteur, ne le décalent pas.
    const { cellules: cells, ligne } = enr
    const lire = (colonne: string) => {
      const index = indexOf(colonne)
      return index === -1 ? '' : (cells[index] ?? '')
    }
    const cellule = (index: number) =>
      (index === -1 ? '' : (cells[index] ?? '')).trim()
    const erreurs: string[] = []

    const gamme = cellule(idxGamme)
    if (gamme === '') erreurs.push(`${COL_GAMME} est obligatoire.`)
    else if (gamme.length > 200)
      erreurs.push(`${COL_GAMME} dépasse 200 caractères.`)

    const existante = gammesExistantes.get(norm(gamme))
    // Une gamme existante n'est pas retouchée : nature et périodicité sont
    // ignorées pour elle (rien à valider, rien à écraser).
    const premiereLigneNouvelle =
      existante === undefined && !nouvellesDecrites.has(norm(gamme))

    let nature: (typeof gammeNatures)[number] | undefined
    let periodiciteId: number | undefined
    if (premiereLigneNouvelle && gamme !== '') {
      const natureBrut = cellule(idxNature)
      nature = resoudreNature(natureBrut)
      if (natureBrut === '') {
        erreurs.push(
          `${COL_NATURE} est obligatoire sur la première ligne d'une gamme.`,
        )
      } else if (!nature) {
        erreurs.push(
          `${COL_NATURE} « ${natureBrut} » inconnue (valeurs possibles : ${gammeNatures
            .map((n) => NATURE_GAMME_LABEL[n])
            .join(', ')}).`,
        )
      }
      const periodiciteBrut = cellule(idxPeriodicite)
      const periodicite = periodicites.find(
        (p) => norm(p.libelle) === norm(periodiciteBrut),
      )
      if (periodiciteBrut === '') {
        erreurs.push(
          `${COL_PERIODICITE} est obligatoire sur la première ligne d'une gamme.`,
        )
      } else if (!periodicite) {
        erreurs.push(
          `${COL_PERIODICITE} « ${periodiciteBrut} » inconnue (valeurs possibles : ${periodicites
            .map((p) => p.libelle)
            .join(', ')}).`,
        )
      } else {
        periodiciteId = periodicite.id
      }
    }

    const operationBrut = lire(COL_OPERATION).trim()
    let operation: OperationCsvResolue | null = null
    if (operationBrut === '') {
      // Ligne « gamme seule » : les colonnes d'opération doivent rester vides.
      const remplies = [
        lire(COL_ORDRE).trim() !== '' ? COL_ORDRE : null,
        lire(COL_TYPE).trim() !== '' ? COL_TYPE : null,
        lire(COL_UNITE).trim() !== '' ? COL_UNITE : null,
        lire(COL_SEUIL_MIN).trim() !== '' ? COL_SEUIL_MIN : null,
        lire(COL_SEUIL_MAX).trim() !== '' ? COL_SEUIL_MAX : null,
        // La description d'opération manquait à ce garde : une ligne « gamme
        // seule » qui en portait une était acceptée, et le texte jeté SANS un
        // mot — alors que le prompt annonce que ces colonnes doivent être vides.
        lire(COL_OP_DESCRIPTION).trim() !== '' ? COL_OP_DESCRIPTION : null,
      ].filter((c): c is string => c !== null)
      if (remplies.length > 0) {
        erreurs.push(
          `${remplies.join(', ')} ne s'applique${remplies.length > 1 ? 'nt' : ''} qu'à une opération — ${COL_OPERATION} est vide.`,
        )
      }
    } else {
      const resolue = resoudreOperation(lire, refs)
      if (!resolue.ok) erreurs.push(...resolue.erreurs)
      else operation = resolue.operation
    }

    if (erreurs.length > 0) return { ok: false, ligne, erreurs }

    if (operation) {
      const prises = opsParGamme.get(norm(gamme)) ?? new Set<string>()
      if (prises.has(norm(operation.values.nom))) {
        return {
          ok: false,
          ligne,
          ignoree: true,
          erreurs: [
            `« ${operation.values.nom} » est déjà une opération de « ${gamme} » — ligne ignorée.`,
          ],
        }
      }
      prises.add(norm(operation.values.nom))
      opsParGamme.set(norm(gamme), prises)
    }
    if (premiereLigneNouvelle) nouvellesDecrites.add(norm(gamme))

    return {
      ok: true,
      ligne,
      gamme,
      nature,
      periodiciteId,
      description: cellule(idxDescription) || undefined,
      operation,
    }
  })

  return { colonnesManquantes: [], lignes }
}

export interface PlanGamme {
  nom: string
  /** `null` = gamme à créer ; sinon l'id de la gamme existante à COMPLÉTER. */
  existantId: string | null
  nature?: (typeof gammeNatures)[number]
  periodiciteId?: number
  description?: string
  operations: OperationCsvResolue[]
}

export interface PlanImportGammes {
  gammes: PlanGamme[]
  nbCreations: number
  nbCompletions: number
  nbOperations: number
}

/**
 * Regroupe les lignes valides par gamme : une gamme déjà en base reçoit ses
 * nouvelles opérations (sans que sa nature ni sa périodicité ne bougent), une
 * gamme inconnue est créée avec les siennes.
 */
export function construirePlan(
  lignes: GammeCsvRowOk[],
  existants: GammeExistante[],
): PlanImportGammes {
  const parNom = new Map(existants.map((g) => [norm(g.nom), g]))
  const gammes = new Map<string, PlanGamme>()

  for (const l of lignes) {
    const k = norm(l.gamme)
    let g = gammes.get(k)
    if (!g) {
      const existante = parNom.get(k)
      g = {
        nom: existante?.nom ?? l.gamme,
        existantId: existante?.id ?? null,
        operations: [],
      }
      gammes.set(k, g)
    }
    if (l.nature !== undefined && g.nature === undefined) g.nature = l.nature
    if (l.periodiciteId !== undefined && g.periodiciteId === undefined) {
      g.periodiciteId = l.periodiciteId
    }
    if (l.description !== undefined && g.description === undefined) {
      g.description = l.description
    }
    if (l.operation) g.operations.push(l.operation)
  }

  const liste = [...gammes.values()]
  return {
    gammes: liste,
    nbCreations: liste.filter((g) => g.existantId === null).length,
    nbCompletions: liste.filter(
      (g) => g.existantId !== null && g.operations.length > 0,
    ).length,
    nbOperations: liste.reduce((acc, g) => acc + g.operations.length, 0),
  }
}

/** « 3 gammes à créer et 12 opérations » — vide si rien à écrire. */
export function resumePlan(plan: PlanImportGammes): string {
  const parts = [
    plan.nbCreations > 0
      ? `${String(plan.nbCreations)} gamme${plan.nbCreations > 1 ? 's' : ''} à créer`
      : null,
    plan.nbCompletions > 0
      ? `${String(plan.nbCompletions)} gamme${plan.nbCompletions > 1 ? 's' : ''} à compléter`
      : null,
    plan.nbOperations > 0
      ? `${String(plan.nbOperations)} opération${plan.nbOperations > 1 ? 's' : ''}`
      : null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1] ?? ''}`
}
