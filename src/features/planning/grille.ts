import { cleSemaine } from '@/features/planning/semaines'

/** OT minimal nécessaire à la grille (cf. `planningQueries.fenetre`). */
export interface PlanningOt {
  id: string
  statut: string
  /** Origine (enum ot_origine) — Planifié (date posée par un humain) / Programmé (généré par le cycle). */
  origine: string
  /** Fenêtre de tolérance (jours) : pilote la bascule vers les statuts temporels. */
  tolerance_jours: number
  /** Gamme vivante de l'OT — sert à retrouver sa sous-catégorie. NULL = gamme purgée. */
  gamme_id: string | null
  nom_gamme: string
  nature_gamme: 'controle_reglementaire' | 'maintenance_preventive'
  nom_prestataire: string
  nom_equipement: string | null
  /** Description (snapshot de la gamme) — sous-titre de repli de la carte `OtCard`. */
  description_gamme: string | null
  /** Snapshot du nom de catégorie — repli d'étiquette quand la gamme a disparu. */
  nom_categorie: string | null
  libelle_periodicite: string
  date_prevue: string
  /** Date de début réelle (en cours) — 2ᵉ choix pour positionner l'OT sur la grille. */
  date_debut: string | null
  /** Date de clôture (OT terminé) — 1ᵉʳ choix de positionnement ET tri par urgence. */
  date_cloture: string | null
  /** Vignette esthétique de l'OT (héritée de la gamme) — pour la carte `OtCard`. */
  miniature_id: string | null
}

/**
 * Famille (= sous-catégorie) + son domaine (= catégorie parente), projetés par la
 * page depuis la hiérarchie `categories`. Le domaine sert au TRI et à la SÉPARATION
 * des groupes (son nom n'est PAS affiché — décision PO), pas comme libellé visible.
 */
export interface CategorieInfo {
  familleCle: string
  familleNom: string
  familleOrdre: number
  domaineCle: string
  domaineOrdre: number
  /** Chemin splat `domaine/famille` vers l'explorateur, ou `null` si non navigable. */
  splat: string | null
}

/** Résout la famille d'un OT (fourni par la page, qui a catégories + gammes). */
export type ResolveCategorie = (ot: PlanningOt) => CategorieInfo

/** Une ligne de la grille = une FAMILLE (sous-catégorie), ses OT par semaine. */
export interface LigneFamille {
  cle: string
  nomFamille: string
  /** Chemin splat vers l'explorateur Plan de maintenance, ou `null` (non cliquable). */
  splat: string | null
  ordre: number
  /** OT indexés par clé de semaine (« annee-numero »), positionnés par date effective. */
  parSemaine: Map<string, PlanningOt[]>
  total: number
}

/**
 * Un groupe = un DOMAINE (catégorie), ses familles. Sert uniquement à TRIER et
 * SÉPARER les familles (trait épais entre domaines) — son nom n'est pas rendu.
 */
export interface GroupeDomaine {
  cle: string
  ordre: number
  familles: LigneFamille[]
  total: number
}

/** Parse une `date_prevue` (`YYYY-MM-DD`) en Date locale (sans fuseau). */
function parseDatePrevue(value: string): Date {
  const [a, m, j] = value.split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1)
}

/**
 * Semaine où afficher un OT sur la grille — MÊME règle que la carte `OtCard` : on
 * prend la BONNE date selon le statut.
 *  - OT TERMINAL (clôturé ou annulé) → sa **date de clôture réelle** (`date_cloture`
 *    porte l'horodatage de clôture OU d'annulation, NON NULL sur tout statut terminal,
 *    cf. contrainte `statut_terminal_a_date_cloture`) → le travail apparaît dans la
 *    semaine où il a VRAIMENT été fait, pas dans sa semaine prévue.
 *  - Sinon (planifié, en cours, rouvert) → sa **date PRÉVUE** : l'échéance reste la
 *    donnée pertinente pour un OT à venir.
 *
 * Décision PO 2026-07-01, qui remplace le positionnement « toujours date prévue » du
 * 2026-06-30 : un OT programmé au futur puis clôturé aujourd'hui restait invisible dans
 * la semaine en cours (« je vois pas que j'ai fait mon truc »). La date de clôture est
 * un TIMESTAMPTZ → `new Date(...)` (instant local) ; la semaine ISO est ensuite calculée
 * en heure locale, comme la semaine courante et la date prévue.
 */
export function dateSemaineOt(ot: PlanningOt): Date {
  const estTerminal = ot.statut === 'cloture' || ot.statut === 'annule'
  if (estTerminal && ot.date_cloture) return new Date(ot.date_cloture)
  return parseDatePrevue(ot.date_prevue)
}

/**
 * Construit les groupes (domaine → familles) de la grille.
 *
 * Les LIGNES viennent du `skeleton` (TOUTES les sous-catégories = familles),
 * affichées en permanence même sans OT cette période. Les OT ne font que REMPLIR
 * les cases, rangés dans la colonne de leur semaine ISO selon leur DATE EFFECTIVE
 * (`dateEffectiveOt`). Un OT dont la famille n'est pas au squelette (gamme purgée)
 * crée sa famille à la volée (repli « Non classé »).
 *
 * Tri : domaines puis familles par `ordre` (calque de l'explorateur Plan de
 * maintenance) puis par nom (insensible à la casse).
 */
export function construireGroupes(
  skeleton: CategorieInfo[],
  ots: PlanningOt[],
  ofOt: ResolveCategorie,
): GroupeDomaine[] {
  const domaines = new Map<string, GroupeDomaine>()
  const familleParCle = new Map<string, LigneFamille>()

  // Garantit la présence du domaine + de la famille de `info`, et renvoie la ligne.
  const assurerFamille = (info: CategorieInfo): LigneFamille => {
    let domaine = domaines.get(info.domaineCle)
    if (!domaine) {
      domaine = {
        cle: info.domaineCle,
        ordre: info.domaineOrdre,
        familles: [],
        total: 0,
      }
      domaines.set(info.domaineCle, domaine)
    }
    let famille = familleParCle.get(info.familleCle)
    if (!famille) {
      famille = {
        cle: info.familleCle,
        nomFamille: info.familleNom,
        splat: info.splat,
        ordre: info.familleOrdre,
        parSemaine: new Map(),
        total: 0,
      }
      familleParCle.set(info.familleCle, famille)
      domaine.familles.push(famille)
    }
    return famille
  }

  // 1. Squelette : toutes les sous-catégories, toujours présentes (lignes vides ok).
  for (const info of skeleton) assurerFamille(info)

  // 2. Remplissage : chaque OT dans la case de sa famille × semaine.
  for (const ot of ots) {
    const info = ofOt(ot)
    const famille = assurerFamille(info)
    const cleSem = cleSemaine(dateSemaineOt(ot))
    const cellule = famille.parSemaine.get(cleSem)
    if (cellule) cellule.push(ot)
    else famille.parSemaine.set(cleSem, [ot])
    famille.total += 1
    const domaine = domaines.get(info.domaineCle)
    if (domaine) domaine.total += 1
  }

  const triNom = (a: string, b: string) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })

  const groupes = [...domaines.values()]
  for (const d of groupes)
    d.familles.sort(
      (a, b) => a.ordre - b.ordre || triNom(a.nomFamille, b.nomFamille),
    )
  groupes.sort((a, b) => a.ordre - b.ordre)
  return groupes
}
