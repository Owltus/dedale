import type { Json, Tables } from '@/lib/database.types'
import { parseChamps, type Champ, type ChampValeur } from '@/lib/champs'
import { writeErrorMessage } from '@/lib/erreurs'

/**
 * Déploiement en masse d'une flotte (184) : lecture des réponses JSON de
 * `deployer_equipements` / `annuler_deploiement` et préparation des paramètres.
 * Module PUR (aucun appel réseau) : la base calcule, le front présente.
 */

type Categorie = Tables<'categories'>
type Modele = Pick<
  Tables<'modeles_equipements'>,
  'id' | 'specifications' | 'miniature_id'
>

// --- Sous-catégories déployables et gabarit --------------------------------

/** Une sous-catégorie de parc proposée au déploiement, avec sa catégorie. */
export interface FlotteDeployable {
  id: string
  nom: string
  categorie: string
  /** Clé de la caractéristique « valeur principale » (nom du lieu par défaut). */
  valeurPrincipale: string | null
  modeleId: string | null
}

/**
 * Sous-catégories de parc du site, actives, rangées sous une catégorie racine
 * du même site — exactement ce que `deployer_equipements` accepte. Triées par
 * catégorie puis par nom.
 */
export function flottesDeployables(
  categories: readonly Categorie[],
  siteId: string,
): FlotteDeployable[] {
  const parId = new Map(categories.map((c) => [c.id, c]))
  const out: FlotteDeployable[] = []
  for (const c of categories) {
    if (c.scope !== 'parc' || c.site_id !== siteId || !c.est_actif) continue
    const parent = c.parent_id === null ? undefined : parId.get(c.parent_id)
    if (parent?.parent_id !== null || parent.site_id !== siteId) continue
    out.push({
      id: c.id,
      nom: c.nom,
      categorie: parent.nom,
      valeurPrincipale: c.valeur_principale,
      modeleId: c.modele_equipement_id,
    })
  }
  return out.sort(
    (a, b) =>
      a.categorie.localeCompare(b.categorie, 'fr') ||
      a.nom.localeCompare(b.nom, 'fr'),
  )
}

/** Gabarit hérité par un équipement créé dans une sous-catégorie de parc. */
export interface GabaritSousCategorie {
  champs: Champ[]
  miniatureId: string | null
  modeleId: string | null
}

/**
 * Gabarit d'une sous-catégorie : celui du MODÈLE fixé, sinon le gabarit
 * « spécifique » de la sous-catégorie — la même règle que la base
 * (`deployer_equipements`) et que la création unitaire.
 */
export function gabaritSousCategorie(
  categorie: Pick<
    Categorie,
    'modele_equipement_id' | 'specifications' | 'miniature_id'
  >,
  modeles: readonly Modele[],
): GabaritSousCategorie {
  if (categorie.modele_equipement_id) {
    const m = modeles.find((x) => x.id === categorie.modele_equipement_id)
    return {
      champs: parseChamps(m?.specifications),
      miniatureId: m?.miniature_id ?? null,
      modeleId: categorie.modele_equipement_id,
    }
  }
  return {
    champs: parseChamps(categorie.specifications),
    miniatureId: categorie.miniature_id ?? null,
    modeleId: null,
  }
}

// --- Valeurs communes -------------------------------------------------------

/**
 * La valeur principale prend le nom du lieu quand elle désigne une
 * caractéristique TEXTE que la personne laisse vide (règle de la base).
 */
export function estPrincipaleNomDuLieu(
  champ: Champ,
  valeurPrincipale: string | null,
): boolean {
  return champ.cle === valeurPrincipale && champ.type === 'texte'
}

/** Valeur de départ d'un champ : vide pour la principale, sinon valeur ?? défaut. */
export function valeurInitiale(
  champ: Champ,
  valeurPrincipale: string | null,
): ChampValeur {
  if (estPrincipaleNomDuLieu(champ, valeurPrincipale)) return null
  return champ.valeur ?? champ.defaut ?? null
}

/** Égalité de deux valeurs de champ (double référence comparée par parts). */
function memeValeur(a: ChampValeur, b: ChampValeur): boolean {
  if (
    typeof a === 'object' &&
    a !== null &&
    typeof b === 'object' &&
    b !== null
  )
    return a.a === b.a && a.b === b.b
  return a === b
}

/**
 * `p_valeurs` de `deployer_equipements` : seulement les caractéristiques que
 * la personne a CHANGÉES par rapport à leur valeur de départ (la base applique
 * déjà les défauts). La principale laissée vide n'est pas envoyée : chaque
 * équipement prendra le nom de son lieu. `null` = rien à envoyer.
 */
export function valeursDeploiement(
  champs: readonly Champ[],
  saisies: readonly ChampValeur[],
  valeurPrincipale: string | null,
): Record<string, Json> | null {
  const out: Record<string, Json> = {}
  champs.forEach((c, i) => {
    const v = saisies[i] ?? null
    if (estPrincipaleNomDuLieu(c, valeurPrincipale)) {
      if (typeof v === 'string' && v.trim() !== '') out[c.cle] = v
      return
    }
    if (memeValeur(v, valeurInitiale(c, valeurPrincipale))) return
    out[c.cle] = typeof v === 'object' && v !== null ? { a: v.a, b: v.b } : v
  })
  return Object.keys(out).length === 0 ? null : out
}

/**
 * Première caractéristique obligatoire laissée vide (oui-non exclu, comme la
 * base ; la principale texte est remplie par le nom du lieu). `null` = complet.
 */
export function champObligatoireManquant(
  champs: readonly Champ[],
  saisies: readonly ChampValeur[],
  valeurPrincipale: string | null,
): string | null {
  const i = champs.findIndex((c, k) => {
    if (!c.requis || c.type === 'oui-non') return false
    if (estPrincipaleNomDuLieu(c, valeurPrincipale)) return false
    const v = saisies[k] ?? null
    return v === null || v === ''
  })
  return i === -1 ? null : (champs[i]?.cle ?? null)
}

// --- Lecture des réponses ---------------------------------------------------

type Objet = Record<string, Json | undefined>

function estObjet(v: Json | undefined): v is Objet {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function texte(v: Json | undefined): string {
  return typeof v === 'string' ? v : ''
}
function texteOuNull(v: Json | undefined): string | null {
  return typeof v === 'string' ? v : null
}
function nombre(v: Json | undefined): number {
  return typeof v === 'number' ? v : 0
}
function objets(v: Json | undefined): Objet[] {
  return Array.isArray(v) ? v.filter(estObjet) : []
}

/** Aperçu (ou résultat) de `deployer_equipements`, tel que rendu par la base. */
export interface ApercuDeploiement {
  site: string
  sousCategorie: {
    nom: string
    categorie: string | null
    modele: string | null
  }
  lieuxDemandes: number
  aCreer: number
  doublonsIgnores: boolean
  doublons: {
    localId: string
    lieu: string
    batiment: string
    niveau: string
    existants: number
  }[]
  parBatimentNiveau: {
    batiment: string
    niveau: string
    aCreer: number
    doublons: number
  }[]
  exemples: { lieu: string; libelle: string; champs: Champ[] }[]
  gammes: {
    id: string
    nom: string
    repeterParEquipement: boolean
    otOuverts: number
    operationsAjoutees: number
  }[]
  lot: string | null
  equipementIds: string[]
}

/** Lit la réponse de `deployer_equipements` (champs absents → valeurs neutres). */
export function lireApercuDeploiement(json: Json): ApercuDeploiement {
  const r = estObjet(json) ? json : {}
  const site = estObjet(r.site) ? r.site : {}
  const sc = estObjet(r.sous_categorie) ? r.sous_categorie : {}
  return {
    site: texte(site.nom),
    sousCategorie: {
      nom: texte(sc.nom),
      categorie: texteOuNull(sc.categorie),
      modele: texteOuNull(sc.modele),
    },
    lieuxDemandes: nombre(r.lieux_demandes),
    aCreer: nombre(r.a_creer),
    doublonsIgnores: r.doublons_ignores !== false,
    doublons: objets(r.doublons).map((d) => ({
      localId: texte(d.local_id),
      lieu: texte(d.lieu),
      batiment: texte(d.batiment),
      niveau: texte(d.niveau),
      existants: nombre(d.existants),
    })),
    parBatimentNiveau: objets(r.par_batiment_niveau).map((p) => ({
      batiment: texte(p.batiment),
      niveau: texte(p.niveau),
      aCreer: nombre(p.a_creer),
      doublons: nombre(p.doublons),
    })),
    exemples: objets(r.exemples).map((e) => ({
      lieu: texte(e.lieu),
      libelle: texte(e.libelle),
      champs: parseChamps(e.specifications),
    })),
    gammes: objets(r.gammes).map((g) => ({
      id: texte(g.id),
      nom: texte(g.nom),
      repeterParEquipement: g.repeter_par_equipement === true,
      otOuverts: nombre(g.ot_ouverts),
      operationsAjoutees: nombre(g.operations_ajoutees_ot_ouverts),
    })),
    lot: texteOuNull(r.lot),
    equipementIds: Array.isArray(r.equipement_ids)
      ? r.equipement_ids.filter((x): x is string => typeof x === 'string')
      : [],
  }
}

/** Aperçu (ou résultat) de `annuler_deploiement`. */
export interface ApercuAnnulation {
  total: number
  aSupprimer: number
  supprimes: number
  conserves: { id: string; lieu: string; raisons: string[] }[]
  gammes: { id: string; nom: string; operationsRetirees: number }[]
}

/** Lit la réponse de `annuler_deploiement`. */
export function lireApercuAnnulation(json: Json): ApercuAnnulation {
  const r = estObjet(json) ? json : {}
  return {
    total: nombre(r.total),
    aSupprimer: nombre(r.a_supprimer),
    supprimes: nombre(r.supprimes),
    conserves: objets(r.conserves).map((c) => ({
      id: texte(c.id),
      lieu: texte(c.lieu),
      raisons: Array.isArray(c.raisons)
        ? c.raisons.filter((x): x is string => typeof x === 'string')
        : [],
    })),
    gammes: objets(r.gammes).map((g) => ({
      id: texte(g.id),
      nom: texte(g.nom),
      operationsRetirees: nombre(g.operations_retirees_ot_ouverts),
    })),
  }
}

/** « 3 équipements » / « 1 équipement » (accord du nom). */
export function nbEquipements(n: number): string {
  return `${String(n)} équipement${n > 1 ? 's' : ''}`
}

/**
 * Erreur d'un déploiement ou de son annulation, en français. Les refus métier
 * de la base (plafond de 500 lieux, mélange de sites, famille invalide, plan du
 * commun, caractéristique refusée…) arrivent déjà rédigés (P0001) et passent
 * tels quels ; un refus de droits (42501) est reformulé pour ce geste.
 */
export function messageErreurDeploiement(e: unknown): string {
  return writeErrorMessage(e, {
    '42501':
      'Déploiement refusé : un lieu, la famille ou un plan de maintenance est hors de vos sites, ou votre rôle ne le permet pas.',
  })
}

// --- Lots d'une flotte (accès durable à l'annulation) -----------------------

/** Un déploiement passé d'une flotte, tel qu'il reste en base. */
export interface LotDeploiement {
  lot: string
  /** Premier `created_at` du lot (instant du déploiement). */
  debut: string
  /** Équipements du lot encore présents. */
  nombre: number
}

/**
 * Regroupe les équipements d'une flotte par `lot_deploiement` : un lot par
 * déploiement, daté de son premier équipement, du plus récent au plus ancien.
 * Les équipements hors lot (créés un par un, importés) sont ignorés.
 */
export function regrouperLots(
  lignes: readonly { lot_deploiement: string | null; created_at: string }[],
): LotDeploiement[] {
  const parLot = new Map<string, LotDeploiement>()
  for (const l of lignes) {
    if (l.lot_deploiement === null) continue
    const deja = parLot.get(l.lot_deploiement)
    if (!deja) {
      parLot.set(l.lot_deploiement, {
        lot: l.lot_deploiement,
        debut: l.created_at,
        nombre: 1,
      })
      continue
    }
    deja.nombre += 1
    if (Date.parse(l.created_at) < Date.parse(deja.debut))
      deja.debut = l.created_at
  }
  return [...parLot.values()].sort(
    (a, b) =>
      Date.parse(b.debut) - Date.parse(a.debut) || (a.lot < b.lot ? -1 : 1),
  )
}
