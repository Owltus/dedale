import { useMemo } from 'react'
import { cleSemaine } from '@/features/planning/semaines'
import { parseDateLocale } from '@/lib/date'
import { segOfUnique } from '@/lib/slug'
import type { Categorie } from '@/features/categories/queries'

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
  return parseDateLocale(ot.date_prevue)
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

/** Gamme minimale nécessaire à la résolution OT → sous-catégorie. */
interface GammeSkelInput {
  id: string
  categorie_id: string
}

/**
 * À partir des catégories + des GAMMES du site, expose :
 *  - `skeleton` : TOUTES les sous-catégories de gamme (= lignes/familles),
 *    affichées en permanence même sans OT, rattachées à leur catégorie (domaine) ;
 *  - `ofOt` : la famille d'un OT (pour remplir les cases) via `gamme_id →
 *    categorie_id`. Repli « Non classé » si la gamme est purgée / non résolue.
 *
 * Famille = sous-catégorie (où pointe `gammes.categorie_id`) ; domaine = sa
 * catégorie parente — utilisé pour TRIER et SÉPARER les familles (son nom n'est PAS
 * affiché). Le `splat` (chemin explorateur) n'est calculé que pour une famille
 * NAVIGABLE (catégorie active, scope gamme, domaine racine).
 */
export function useResolveCategorie(
  categories: Categorie[],
  gammes: GammeSkelInput[],
): { skeleton: CategorieInfo[]; ofOt: ResolveCategorie } {
  return useMemo(() => {
    const parId = new Map(categories.map((c) => [c.id, c]))
    const gammeCategorie = new Map(gammes.map((g) => [g.id, g.categorie_id]))
    // Catégories de GAMME visibles (calque de l'explorateur Plan de maintenance) :
    // squelette des familles + décide la navigabilité + compose les slugs.
    const gammeCats = categories.filter(
      (c) => c.est_actif && (c.scope === 'gamme' || c.scope === 'mixte'),
    )
    const gammeCatIds = new Set(gammeCats.map((c) => c.id))
    const racines = gammeCats
      .filter((c) => c.parent_id === null)
      .map((c) => ({ nom: c.nom, id: c.id }))
    const enfantsParParent = new Map<string, { nom: string; id: string }[]>()
    for (const c of gammeCats) {
      if (c.parent_id === null) continue
      const arr = enfantsParParent.get(c.parent_id) ?? []
      arr.push({ nom: c.nom, id: c.id })
      enfantsParParent.set(c.parent_id, arr)
    }

    // Projette une sous-catégorie (famille) en `CategorieInfo` (domaine = parent).
    const infoDeCategorie = (fam: Categorie): CategorieInfo => {
      const parent = fam.parent_id ? parId.get(fam.parent_id) : undefined
      let splat: string | null = null
      if (
        parent &&
        gammeCatIds.has(fam.id) &&
        gammeCatIds.has(parent.id) &&
        parent.parent_id === null
      ) {
        const domSeg = segOfUnique({ nom: parent.nom, id: parent.id }, racines)
        const famSeg = segOfUnique(
          { nom: fam.nom, id: fam.id },
          enfantsParParent.get(parent.id) ?? [],
        )
        splat = `${domSeg}/${famSeg}`
      }
      // Domaine = parent ; cas défensif (sous-cat racine) → son propre domaine.
      return {
        familleCle: fam.id,
        familleNom: fam.nom,
        familleOrdre: fam.ordre,
        domaineCle: parent ? parent.id : `racine:${fam.id}`,
        domaineOrdre: parent ? parent.ordre : fam.ordre,
        splat,
      }
    }

    // Squelette = toutes les sous-catégories de gamme (parent non nul).
    const skeleton = gammeCats
      .filter((c) => c.parent_id !== null)
      .map(infoDeCategorie)

    const nonClasse = (label: string | null): CategorieInfo => ({
      familleCle: label ? `cat-nom:${label.toLowerCase()}` : '__non_classe__',
      familleNom: label ?? 'Non classé',
      familleOrdre: Number.MAX_SAFE_INTEGER,
      domaineCle: '__non_classe__',
      domaineOrdre: Number.MAX_SAFE_INTEGER,
      splat: null,
    })

    const ofOt = (ot: PlanningOt): CategorieInfo => {
      const categorieId = ot.gamme_id
        ? gammeCategorie.get(ot.gamme_id)
        : undefined
      const fam = categorieId ? parId.get(categorieId) : undefined
      if (!fam) {
        // Chaîne vide → « Non classé » (≠ `??` : `''` doit retomber sur `null`).
        const label = ot.nom_categorie?.trim()
        return nonClasse(label && label.length > 0 ? label : null)
      }
      return infoDeCategorie(fam)
    }

    return { skeleton, ofOt }
  }, [categories, gammes])
}
