import { parseCsvIndexe } from '@/lib/csv'
import { CHAMP_TYPES, resoudreValeurTexte, type Champ } from '@/lib/champs'
import { parseOuiNon } from '@/features/operations/csv-import'

/** Séparateur imposé du CSV d'import (la virgule reste la décimale française). */
export const CSV_DELIMITER = ';'

const COL_MODELE = 'Modèle'
const COL_MODELE_DESCRIPTION = 'Description du modèle'
const COL_CARACTERISTIQUE = 'Caractéristique'
const COL_TYPE = 'Type'
const COL_UNITE = 'Unité'
const COL_OPTIONS = 'Valeurs possibles'
const COL_REQUIS = 'Obligatoire'
const COL_DEFAUT = 'Valeur par défaut'

/** Séparateur des choix d'une caractéristique de type Liste, dans UNE cellule. */
const SEP_OPTIONS = '|'

/** Modèle déjà en base : complété (jamais dupliqué ni écrasé). */
export interface ModeleEquipementExistant {
  id: string
  nom: string
  /** Caractéristiques déjà définies — celles-là ne sont jamais retouchées. */
  champs: Champ[]
}

const norm = (s: string) => s.trim().toLowerCase()

/** Libellé de type de champ → valeur stockée (« Oui / Non » → `oui-non`). */
function resoudreType(brut: string): (typeof CHAMP_TYPES)[number] | undefined {
  const v = norm(brut).replace(/\s/g, '')
  return CHAMP_TYPES.find(
    (t) => norm(t.label).replace(/\s/g, '') === v || t.value === v,
  )
}

/**
 * Prompt prêt à coller dans n'importe quelle IA générative : décrit le CSV
 * EXACT attendu pour créer des modèles d'équipements (le gabarit dont
 * héritent les équipements réels) avec leurs caractéristiques. Une ligne =
 * UNE caractéristique ; le nom du modèle est répété sur chacune de ses
 * lignes, comme le bâtiment l'est pour ses locaux.
 */
export function buildImportPrompt(params: {
  categorieNom: string
  existants: ModeleEquipementExistant[]
}): string {
  const { categorieNom, existants } = params
  const existantsTexte =
    existants.length > 0
      ? [
          ``,
          `Modèles DÉJÀ enregistrés dans cette catégorie. Ne les recrée pas à l'identique : ne les remets dans le CSV que s'il leur manque une caractéristique (elle sera ajoutée ; celles déjà présentes ne bougeront pas).`,
          ...existants.map(
            (m) =>
              `- ${m.nom}${
                m.champs.length > 0
                  ? ` (caractéristiques déjà définies : ${m.champs
                      .map((c) => c.cle)
                      .join(', ')})`
                  : ' (aucune caractéristique)'
              }`,
          ),
        ]
      : []

  return [
    `Tu vas produire un fichier CSV pour créer des MODÈLES D'ÉQUIPEMENTS dans une GMAO (gestion de maintenance).`,
    ``,
    `Un modèle d'équipement est un gabarit : il décrit les informations à renseigner pour chaque équipement de ce type (marque, puissance, numéro de série…). Il ne s'agit PAS d'équipements réels, mais du formulaire type dont ils hériteront.`,
    ``,
    `Catégorie ciblée : « ${categorieNom} ». Tous les modèles du CSV y seront rangés.`,
    ``,
    `Format EXACT attendu :`,
    `- Séparateur de colonnes : point-virgule ( ; )`,
    `- Encodage : UTF-8`,
    `- Une ligne d'en-tête avec EXACTEMENT ces noms de colonnes, dans cet ordre.`,
    `- Ensuite UNE LIGNE PAR CARACTÉRISTIQUE. Le nom du modèle est RÉPÉTÉ sur chacune de ses lignes, et ses lignes se suivent.`,
    `- Un modèle sans aucune caractéristique s'écrit sur une seule ligne, avec ${COL_CARACTERISTIQUE} et les colonnes suivantes vides.`,
    `- Si une cellule contient un point-virgule ou un retour à la ligne, entoure-la de guillemets doubles.`,
    `- Ne réponds RIEN d'autre que le contenu du CSV (pas de phrase avant/après, pas de bloc de code superflu).`,
    ``,
    `Colonnes :`,
    `- ${COL_MODELE} — obligatoire. Le nom du modèle (ex. « Chaudière gaz murale »). Répété à l'identique sur toutes ses lignes.`,
    `- ${COL_MODELE_DESCRIPTION} — optionnel. Une phrase décrivant le modèle. À ne remplir que sur la PREMIÈRE ligne du modèle.`,
    `- ${COL_CARACTERISTIQUE} — le nom de l'information à renseigner (ex. « Marque », « Puissance »). 60 caractères maximum, jamais deux fois la même pour un même modèle.`,
    `- ${COL_TYPE} — obligatoire dès que ${COL_CARACTERISTIQUE} est rempli. UNIQUEMENT une de ces valeurs : ${CHAMP_TYPES.map(
      (t) => `« ${t.label} »`,
    ).join(', ')}.`,
    `- ${COL_UNITE} — optionnel, et UNIQUEMENT si ${COL_TYPE} vaut « Nombre » (ex. « kW », « bar », « L »). Vide partout ailleurs.`,
    `- ${COL_OPTIONS} — obligatoire UNIQUEMENT si ${COL_TYPE} vaut « Liste » : les choix possibles séparés par une barre verticale ( ${SEP_OPTIONS} ), par exemple « Gaz ${SEP_OPTIONS} Fioul ${SEP_OPTIONS} Électrique ». Vide partout ailleurs.`,
    `- ${COL_REQUIS} — optionnel. « Oui » si l'information devra obligatoirement être renseignée sur chaque équipement, « Non » ou vide sinon.`,
    `- ${COL_DEFAUT} — optionnel. La valeur proposée par défaut, cohérente avec le type : un nombre à virgule française pour « Nombre », JJ/MM/AAAA pour « Date », « Oui »/« Non » pour « Oui / Non », et pour « Liste » une valeur figurant dans ${COL_OPTIONS}.`,
    ...existantsTexte,
    ``,
    `Voici les données brutes à convertir (colle-les à la suite de ce message) :`,
    ``,
  ].join('\n')
}

export interface ModeleEquipementCsvRowOk {
  ok: true
  ligne: number
  modele: string
  description?: string
  /** `null` = ligne d'un modèle sans caractéristique. */
  champ: Champ | null
}
export interface ModeleEquipementCsvRowKo {
  ok: false
  ligne: number
  erreurs: string[]
  ignoree?: boolean
}
export type ModeleEquipementCsvRow =
  | ModeleEquipementCsvRowOk
  | ModeleEquipementCsvRowKo

export interface ModeleEquipementCsvResult {
  colonnesManquantes: string[]
  lignes: ModeleEquipementCsvRow[]
}

/**
 * Parse + valide un CSV collé de modèles d'équipements : une ligne = une
 * caractéristique, rattachée au modèle nommé sur la même ligne. Une
 * caractéristique déjà définie sur un modèle existant (ou déjà rencontrée plus
 * haut dans le CSV) est marquée « déjà en base » : on complète, on n'écrase
 * jamais. Fonction PURE.
 */
export function parseImportCsv(
  texte: string,
  existants: ModeleEquipementExistant[] = [],
): ModeleEquipementCsvResult {
  const rows = parseCsvIndexe(texte, CSV_DELIMITER)
  if (rows.length === 0) return { colonnesManquantes: [], lignes: [] }

  const header = (rows[0]?.cellules ?? []).map((h) => h.trim())
  const indexOf = (nom: string) =>
    header.findIndex((h) => norm(h) === norm(nom))
  const idx = {
    modele: indexOf(COL_MODELE),
    description: indexOf(COL_MODELE_DESCRIPTION),
    caracteristique: indexOf(COL_CARACTERISTIQUE),
    type: indexOf(COL_TYPE),
    unite: indexOf(COL_UNITE),
    options: indexOf(COL_OPTIONS),
    requis: indexOf(COL_REQUIS),
    defaut: indexOf(COL_DEFAUT),
  }

  const colonnesManquantes: string[] = []
  if (idx.modele === -1) colonnesManquantes.push(COL_MODELE)
  if (idx.caracteristique === -1) colonnesManquantes.push(COL_CARACTERISTIQUE)
  if (colonnesManquantes.length > 0) return { colonnesManquantes, lignes: [] }

  // Caractéristiques déjà prises, par modèle (base + lignes précédentes du CSV) :
  // une clé déjà connue n'est jamais réécrite.
  const clesParModele = new Map<string, Set<string>>()
  for (const m of existants) {
    clesParModele.set(norm(m.nom), new Set(m.champs.map((c) => norm(c.cle))))
  }

  const lignes: ModeleEquipementCsvRow[] = rows.slice(1).map((enr) => {
    // `ligne` = numéro dans le TEXTE COLLÉ (1 = en-tête) : les lignes
    // blanches, écartées par le lecteur, ne le décalent pas.
    const { cellules: cells, ligne } = enr
    const lire = (index: number) => (index === -1 ? '' : (cells[index] ?? ''))
    const erreurs: string[] = []

    const modele = lire(idx.modele).trim()
    if (modele === '') erreurs.push(`${COL_MODELE} est obligatoire.`)
    else if (modele.length > 200)
      erreurs.push(`${COL_MODELE} dépasse 200 caractères.`)

    const description = lire(idx.description).trim()
    const cle = lire(idx.caracteristique).trim()
    const typeBrut = lire(idx.type).trim()
    const uniteBrut = lire(idx.unite).trim()
    const optionsBrut = lire(idx.options).trim()
    const requisBrut = lire(idx.requis).trim()
    const defautBrut = lire(idx.defaut).trim()

    // Ligne « modèle seul » : les colonnes de caractéristique doivent rester vides.
    if (cle === '') {
      const remplies = [
        typeBrut !== '' ? COL_TYPE : null,
        uniteBrut !== '' ? COL_UNITE : null,
        optionsBrut !== '' ? COL_OPTIONS : null,
        defautBrut !== '' ? COL_DEFAUT : null,
      ].filter((c): c is string => c !== null)
      if (remplies.length > 0) {
        erreurs.push(
          `${remplies.join(', ')} ne s'applique${remplies.length > 1 ? 'nt' : ''} qu'à une caractéristique — ${COL_CARACTERISTIQUE} est vide.`,
        )
      }
      if (erreurs.length > 0) return { ok: false, ligne, erreurs }
      return {
        ok: true,
        ligne,
        modele,
        description: description || undefined,
        champ: null,
      }
    }

    if (cle.length > 60)
      erreurs.push(`${COL_CARACTERISTIQUE} dépasse 60 caractères.`)

    const type = resoudreType(typeBrut)
    if (typeBrut === '') {
      erreurs.push(`${COL_TYPE} est obligatoire pour une caractéristique.`)
    } else if (!type) {
      erreurs.push(
        `${COL_TYPE} « ${typeBrut} » inconnu (valeurs possibles : ${CHAMP_TYPES.map(
          (t) => t.label,
        ).join(', ')}).`,
      )
    }

    let options: string[] | undefined
    if (type?.value === 'liste') {
      options = optionsBrut
        .split(SEP_OPTIONS)
        .map((o) => o.trim())
        .filter((o) => o !== '')
      if (options.length === 0) {
        erreurs.push(
          `${COL_OPTIONS} est obligatoire pour une caractéristique de type « Liste » (valeurs séparées par « ${SEP_OPTIONS} »).`,
        )
        options = undefined
      }
    } else if (optionsBrut !== '') {
      erreurs.push(`${COL_OPTIONS} ne s'applique qu'au type « Liste ».`)
    }

    let unite: string | undefined
    if (type?.value === 'nombre') {
      unite = uniteBrut || undefined
      if (unite !== undefined && unite.length > 20)
        erreurs.push(`${COL_UNITE} dépasse 20 caractères.`)
    } else if (uniteBrut !== '') {
      erreurs.push(`${COL_UNITE} ne s'applique qu'au type « Nombre ».`)
    }

    let requis = false
    if (requisBrut !== '') {
      const b = parseOuiNon(requisBrut)
      if (b === null)
        erreurs.push(
          `${COL_REQUIS} : « ${requisBrut} » doit être « Oui » ou « Non ».`,
        )
      else requis = b
    }

    if (erreurs.length > 0 || !type) {
      return {
        ok: false,
        ligne,
        erreurs:
          erreurs.length > 0 ? erreurs : [`${COL_TYPE} est obligatoire.`],
      }
    }

    // Valeur par défaut validée sur la définition elle-même : un défaut hors
    // liste ou une date mal écrite est refusée ici plutôt qu'à la saisie.
    const champ: Champ = {
      cle,
      type: type.value,
      unite,
      options,
      requis,
      defaut: null,
    }
    if (defautBrut !== '') {
      const r = resoudreValeurTexte(champ, defautBrut)
      if (!r.ok) erreurs.push(`${COL_DEFAUT} : ${r.erreur}`)
      else champ.defaut = r.valeur
    }
    if (erreurs.length > 0) return { ok: false, ligne, erreurs }

    const prises = clesParModele.get(norm(modele)) ?? new Set<string>()
    if (prises.has(norm(cle))) {
      return {
        ok: false,
        ligne,
        ignoree: true,
        erreurs: [
          `« ${cle} » est déjà définie sur « ${modele} » — ligne ignorée.`,
        ],
      }
    }
    prises.add(norm(cle))
    clesParModele.set(norm(modele), prises)

    return {
      ok: true,
      ligne,
      modele,
      description: description || undefined,
      champ,
    }
  })

  return { colonnesManquantes: [], lignes }
}

export interface PlanModeleEquipement {
  nom: string
  description?: string
  /** `null` = modèle à créer ; sinon l'id du modèle existant à COMPLÉTER. */
  existantId: string | null
  /** Caractéristiques déjà en base (conservées telles quelles à l'écriture). */
  champsExistants: Champ[]
  /** Caractéristiques APPORTÉES par le CSV (jamais en conflit avec les précédentes). */
  champsAjoutes: Champ[]
}

export interface PlanImportModelesEquipements {
  modeles: PlanModeleEquipement[]
  nbCreations: number
  nbCompletions: number
  nbCaracteristiques: number
}

/**
 * Regroupe les lignes valides par modèle : un modèle déjà en base est
 * COMPLÉTÉ (ses caractéristiques existantes sont conservées, celles du CSV
 * ajoutées à la suite) ; un modèle inconnu est créé. C'est ce que la modale
 * exécute ensuite, modèle par modèle.
 */
export function construirePlan(
  lignes: ModeleEquipementCsvRowOk[],
  existants: ModeleEquipementExistant[],
): PlanImportModelesEquipements {
  const parNom = new Map(existants.map((m) => [norm(m.nom), m]))
  const modeles = new Map<string, PlanModeleEquipement>()

  for (const l of lignes) {
    const k = norm(l.modele)
    let m = modeles.get(k)
    if (!m) {
      const existant = parNom.get(k)
      m = {
        nom: existant?.nom ?? l.modele,
        existantId: existant?.id ?? null,
        champsExistants: existant?.champs ?? [],
        champsAjoutes: [],
      }
      modeles.set(k, m)
    }
    if (l.description !== undefined && m.description === undefined) {
      m.description = l.description
    }
    if (l.champ) m.champsAjoutes.push(l.champ)
  }

  const liste = [...modeles.values()]
  return {
    modeles: liste,
    nbCreations: liste.filter((m) => m.existantId === null).length,
    nbCompletions: liste.filter(
      (m) => m.existantId !== null && m.champsAjoutes.length > 0,
    ).length,
    nbCaracteristiques: liste.reduce(
      (acc, m) => acc + m.champsAjoutes.length,
      0,
    ),
  }
}

/** « 2 modèles et 7 caractéristiques » — vide si rien à écrire. */
export function resumePlan(plan: PlanImportModelesEquipements): string {
  const parts = [
    plan.nbCreations > 0
      ? `${String(plan.nbCreations)} modèle${plan.nbCreations > 1 ? 's' : ''} à créer`
      : null,
    plan.nbCompletions > 0
      ? `${String(plan.nbCompletions)} modèle${plan.nbCompletions > 1 ? 's' : ''} à compléter`
      : null,
    plan.nbCaracteristiques > 0
      ? `${String(plan.nbCaracteristiques)} caractéristique${plan.nbCaracteristiques > 1 ? 's' : ''}`
      : null,
  ].filter((p): p is string => p !== null)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1] ?? ''}`
}
