import { cleSemaine } from '@/features/planning/semaines'

/** OT minimal nécessaire à la grille (cf. `planningQueries.fenetre`). */
export interface PlanningOt {
  id: string
  statut: string
  gamme_id: string | null
  nom_gamme: string
  nature_gamme: 'controle_reglementaire' | 'maintenance_preventive'
  nom_prestataire: string
  nom_equipement: string | null
  libelle_periodicite: string
  date_prevue: string
}

/** Une ligne de la grille = une gamme, ses OT répartis par clé de semaine. */
export interface LigneGamme {
  /** Clé de regroupement : `gamme_id`, ou `nom-gamme:<nom>` à défaut. */
  cle: string
  nomGamme: string
  reglementaire: boolean
  /** OT indexés par clé de semaine (« annee-numero »). */
  parSemaine: Map<string, PlanningOt[]>
  /** Nombre total d'OT de la ligne dans la fenêtre (pour le tri). */
  total: number
}

/** Parse une `date_prevue` (`YYYY-MM-DD`) en Date locale (sans fuseau). */
function parseDatePrevue(value: string): Date {
  const [a, m, j] = value.split('-').map(Number)
  return new Date(a ?? 1970, (m ?? 1) - 1, j ?? 1)
}

/**
 * Construit les lignes de la grille à partir des OT de la fenêtre.
 * Regroupe par gamme, répartit chaque OT dans la colonne de sa semaine ISO.
 * Tri : réglementaires d'abord, puis par nom de gamme (insensible à la casse).
 */
export function construireLignes(ots: PlanningOt[]): LigneGamme[] {
  const lignes = new Map<string, LigneGamme>()

  for (const ot of ots) {
    const cle = ot.gamme_id ?? `nom-gamme:${ot.nom_gamme}`
    let ligne = lignes.get(cle)
    if (!ligne) {
      ligne = {
        cle,
        nomGamme: ot.nom_gamme,
        reglementaire: ot.nature_gamme === 'controle_reglementaire',
        parSemaine: new Map(),
        total: 0,
      }
      lignes.set(cle, ligne)
    }
    const cleSem = cleSemaine(parseDatePrevue(ot.date_prevue))
    const cellule = ligne.parSemaine.get(cleSem)
    if (cellule) {
      cellule.push(ot)
    } else {
      ligne.parSemaine.set(cleSem, [ot])
    }
    ligne.total += 1
  }

  return [...lignes.values()].sort((a, b) => {
    if (a.reglementaire !== b.reglementaire) return a.reglementaire ? -1 : 1
    return a.nomGamme.localeCompare(b.nomGamme, 'fr', { sensitivity: 'base' })
  })
}
