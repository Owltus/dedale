import { parseCsv } from '@/lib/csv'
import {
  COL_OPERATION,
  blocColonnesOperation,
  resoudreOperation,
  type OperationCsvResolue,
  type OperationRefs,
} from '@/features/operations/csv-import'

/** Séparateur imposé du CSV d'import (la virgule reste la décimale française). */
export const CSV_DELIMITER = ';'

const COL_MODELE = "Modèle d'opérations"
const COL_MODELE_DESCRIPTION = 'Description du modèle'

/** Modèle déjà en base : complété (jamais dupliqué ni écrasé). */
export interface ModeleOperationExistant {
  id: string
  nom: string
  /** Libellés des opérations déjà présentes — jamais réécrites. */
  operations: string[]
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Prompt prêt à coller dans n'importe quelle IA générative : décrit le CSV
 * EXACT attendu pour créer des modèles d'opérations (listes d'opérations types
 * réutilisables par les gammes) avec leur contenu. Une ligne = UNE opération ;
 * le nom du modèle est répété sur chacune de ses lignes.
 */
export function buildImportPrompt(params: {
  categorieNom: string
  refs: OperationRefs
  existants: ModeleOperationExistant[]
}): string {
  const { categorieNom, refs, existants } = params
  const existantsTexte =
    existants.length > 0
      ? [
          ``,
          `Modèles DÉJÀ enregistrés dans cette catégorie. Ne les recrée pas à l'identique : ne les remets dans le CSV que s'il leur manque une opération (elle sera ajoutée ; celles déjà présentes ne bougeront pas).`,
          ...existants.map(
            (m) =>
              `- ${m.nom}${
                m.operations.length > 0
                  ? ` (opérations déjà définies : ${m.operations.join(', ')})`
                  : ' (aucune opération)'
              }`,
          ),
        ]
      : []

  return [
    `Tu vas produire un fichier CSV pour créer des MODÈLES D'OPÉRATIONS dans une GMAO (gestion de maintenance).`,
    ``,
    `Un modèle d'opérations est une liste d'opérations types (une check-list de maintenance) que l'on rattache ensuite à une ou plusieurs gammes. Chaque opération décrit un geste à effectuer, et éventuellement une mesure à relever.`,
    ``,
    `Catégorie ciblée : « ${categorieNom} ». Tous les modèles du CSV y seront rangés.`,
    ``,
    `Format EXACT attendu :`,
    `- Séparateur de colonnes : point-virgule ( ; )`,
    `- Encodage : UTF-8`,
    `- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre.`,
    `- Ensuite UNE LIGNE PAR OPÉRATION. Le nom du modèle est RÉPÉTÉ sur chacune de ses lignes, et ses lignes se suivent.`,
    `- Chaque modèle doit contenir au moins une opération.`,
    `- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.`,
    `- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).`,
    ``,
    `Colonnes :`,
    `- ${COL_MODELE} — obligatoire. Le nom du modèle (ex. « Entretien annuel chaudière »). Répété à l'identique sur toutes ses lignes.`,
    `- ${COL_MODELE_DESCRIPTION} — optionnel. Une phrase décrivant le modèle. À ne remplir que sur la PREMIÈRE ligne du modèle.`,
    ...blocColonnesOperation(refs),
    ...existantsTexte,
    ``,
    `Voici les données brutes à convertir (colle-les à la suite de ce message) :`,
    ``,
  ].join('\n')
}

export interface ModeleOperationCsvRowOk {
  ok: true
  ligne: number
  modele: string
  description?: string
  operation: OperationCsvResolue
}
export interface ModeleOperationCsvRowKo {
  ok: false
  ligne: number
  erreurs: string[]
  ignoree?: boolean
}
export type ModeleOperationCsvRow =
  | ModeleOperationCsvRowOk
  | ModeleOperationCsvRowKo

export interface ModeleOperationCsvResult {
  colonnesManquantes: string[]
  lignes: ModeleOperationCsvRow[]
}

/**
 * Parse + valide un CSV collé de modèles d'opérations : une ligne = une
 * opération, rattachée au modèle nommé sur la même ligne. Une opération de
 * même libellé déjà présente sur un modèle existant (ou déjà rencontrée plus
 * haut dans le CSV) est marquée « déjà en base ». Fonction PURE.
 */
export function parseImportCsv(
  texte: string,
  refs: OperationRefs,
  existants: ModeleOperationExistant[] = [],
): ModeleOperationCsvResult {
  const rows = parseCsv(texte, CSV_DELIMITER)
  if (rows.length === 0) return { colonnesManquantes: [], lignes: [] }

  const header = (rows[0] ?? []).map((h) => h.trim())
  const indexOf = (nom: string) =>
    header.findIndex((h) => norm(h) === norm(nom))
  const idxModele = indexOf(COL_MODELE)
  const idxDescription = indexOf(COL_MODELE_DESCRIPTION)

  const colonnesManquantes: string[] = []
  if (idxModele === -1) colonnesManquantes.push(COL_MODELE)
  // Seul le libellé de l'opération est indispensable : les autres colonnes
  // peuvent manquer si le CSV ne décrit que des gestes simples, sans mesure.
  if (indexOf(COL_OPERATION) === -1) colonnesManquantes.push(COL_OPERATION)
  if (colonnesManquantes.length > 0) return { colonnesManquantes, lignes: [] }

  const nomsParModele = new Map<string, Set<string>>()
  for (const m of existants) {
    nomsParModele.set(norm(m.nom), new Set(m.operations.map(norm)))
  }

  const lignes: ModeleOperationCsvRow[] = rows.slice(1).map((cells, i) => {
    const ligne = i + 2 // 1 = en-tête, l'humain compte à partir de 1
    const lire = (colonne: string) => {
      const index = indexOf(colonne)
      return index === -1 ? '' : (cells[index] ?? '')
    }
    const erreurs: string[] = []

    const modele = (idxModele === -1 ? '' : (cells[idxModele] ?? '')).trim()
    if (modele === '') erreurs.push(`${COL_MODELE} est obligatoire.`)
    else if (modele.length > 200)
      erreurs.push(`${COL_MODELE} dépasse 200 caractères.`)

    const resolue = resoudreOperation(lire, refs)
    if (!resolue.ok) erreurs.push(...resolue.erreurs)
    if (erreurs.length > 0 || !resolue.ok) return { ok: false, ligne, erreurs }

    const pris = nomsParModele.get(norm(modele)) ?? new Set<string>()
    if (pris.has(norm(resolue.operation.values.nom))) {
      return {
        ok: false,
        ligne,
        ignoree: true,
        erreurs: [
          `« ${resolue.operation.values.nom} » est déjà une opération de « ${modele} » — ligne ignorée.`,
        ],
      }
    }
    pris.add(norm(resolue.operation.values.nom))
    nomsParModele.set(norm(modele), pris)

    const description = (
      idxDescription === -1 ? '' : (cells[idxDescription] ?? '')
    ).trim()
    return {
      ok: true,
      ligne,
      modele,
      description: description || undefined,
      operation: resolue.operation,
    }
  })

  return { colonnesManquantes: [], lignes }
}

export interface PlanModeleOperation {
  nom: string
  description?: string
  /** `null` = modèle à créer ; sinon l'id du modèle existant à COMPLÉTER. */
  existantId: string | null
  operations: OperationCsvResolue[]
}

export interface PlanImportModelesOperations {
  modeles: PlanModeleOperation[]
  nbCreations: number
  nbCompletions: number
  nbOperations: number
}

/**
 * Regroupe les lignes valides par modèle : un modèle déjà en base reçoit ses
 * nouvelles opérations, un modèle inconnu est créé avec les siennes. C'est ce
 * que la modale exécute ensuite, modèle par modèle puis opération par
 * opération.
 */
export function construirePlan(
  lignes: ModeleOperationCsvRowOk[],
  existants: ModeleOperationExistant[],
): PlanImportModelesOperations {
  const parNom = new Map(existants.map((m) => [norm(m.nom), m]))
  const modeles = new Map<string, PlanModeleOperation>()

  for (const l of lignes) {
    const k = norm(l.modele)
    let m = modeles.get(k)
    if (!m) {
      const existant = parNom.get(k)
      m = {
        nom: existant?.nom ?? l.modele,
        existantId: existant?.id ?? null,
        operations: [],
      }
      modeles.set(k, m)
    }
    if (l.description !== undefined && m.description === undefined) {
      m.description = l.description
    }
    m.operations.push(l.operation)
  }

  const liste = [...modeles.values()]
  return {
    modeles: liste,
    nbCreations: liste.filter((m) => m.existantId === null).length,
    nbCompletions: liste.filter(
      (m) => m.existantId !== null && m.operations.length > 0,
    ).length,
    nbOperations: liste.reduce((acc, m) => acc + m.operations.length, 0),
  }
}

/** « 2 modèles à créer et 9 opérations » — vide si rien à écrire. */
export function resumePlan(plan: PlanImportModelesOperations): string {
  const parts = [
    plan.nbCreations > 0
      ? `${String(plan.nbCreations)} modèle${plan.nbCreations > 1 ? 's' : ''} à créer`
      : null,
    plan.nbCompletions > 0
      ? `${String(plan.nbCompletions)} modèle${plan.nbCompletions > 1 ? 's' : ''} à compléter`
      : null,
    plan.nbOperations > 0
      ? `${String(plan.nbOperations)} opération${plan.nbOperations > 1 ? 's' : ''}`
      : null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1] ?? ''}`
}
