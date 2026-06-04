import { estVerrouille } from '@/features/ordres-travail/schemas'

/** OT tel que renvoyé par `ordresTravailQueries.list` (sous-ensemble utilisé ici). */
interface OtRow {
  statut: string
  nom_gamme: string | null
  date_prevue: string | null
  date_cloture: string | null
}

export interface OtKpis {
  total: number
  enRetard: number
  cetteSemaine: number
  enCours: number
}

/** Date du jour au format ISO court (YYYY-MM-DD), pour comparer aux dates prévues. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Bornes (incluses) de la semaine ISO courante (lundi → dimanche), en ISO court.
 * Cohérent avec la périodicité semaine ISO du projet.
 */
function semaineIsoBornes(): { lundi: string; dimanche: string } {
  const now = new Date()
  const jour = now.getUTCDay() // 0 = dimanche … 6 = samedi
  const decalLundi = jour === 0 ? -6 : 1 - jour
  const lundi = new Date(now)
  lundi.setUTCDate(now.getUTCDate() + decalLundi)
  const dimanche = new Date(lundi)
  dimanche.setUTCDate(lundi.getUTCDate() + 6)
  return {
    lundi: lundi.toISOString().slice(0, 10),
    dimanche: dimanche.toISOString().slice(0, 10),
  }
}

/**
 * Compteurs d'OT à partir de la liste du site.
 * - en retard : date prévue dépassée et OT non clôturé/annulé (donc encore dû) ;
 * - cette semaine : date prévue dans la semaine ISO courante et OT non verrouillé ;
 * - en cours : statut « en_cours » ou « reouvert ».
 */
export function calculerKpisOt(ots: readonly OtRow[]): OtKpis {
  const aujourdhui = todayIso()
  const { lundi, dimanche } = semaineIsoBornes()
  let enRetard = 0
  let cetteSemaine = 0
  let enCours = 0

  for (const ot of ots) {
    const verrouille = estVerrouille(ot.statut)
    if (ot.statut === 'en_cours' || ot.statut === 'reouvert') enCours += 1
    if (!ot.date_prevue || verrouille) continue
    if (ot.date_prevue < aujourdhui) enRetard += 1
    else if (ot.date_prevue >= lundi && ot.date_prevue <= dimanche)
      cetteSemaine += 1
  }

  return { total: ots.length, enRetard, cetteSemaine, enCours }
}

/**
 * Indicateur « gammes à jour » : proportion de gammes qui n'ont aucun OT en
 * retard. Une gamme est « en retard » si au moins un de ses OT (par nom de
 * gamme) est en retard. Honnête et simple : on s'appuie sur le nom de gamme
 * dénormalisé sur l'OT (`nom_gamme`).
 */
export interface GammesSante {
  total: number
  enRetard: number
  /** Pourcentage de gammes à jour (0–100), ou null si aucune gamme. */
  pourcentage: number | null
}

export function calculerSanteGammes(
  nomsGammes: readonly string[],
  ots: readonly OtRow[],
): GammesSante {
  const total = nomsGammes.length
  if (total === 0) return { total: 0, enRetard: 0, pourcentage: null }

  const aujourdhui = todayIso()
  const gammesEnRetard = new Set<string>()
  for (const ot of ots) {
    if (
      ot.nom_gamme &&
      ot.date_prevue &&
      !estVerrouille(ot.statut) &&
      ot.date_prevue < aujourdhui
    ) {
      gammesEnRetard.add(ot.nom_gamme)
    }
  }

  const enRetard = gammesEnRetard.size
  const aJour = Math.max(0, total - enRetard)
  return {
    total,
    enRetard,
    pourcentage: Math.round((aJour / total) * 100),
  }
}

/** Nombre de jours (entiers, peut être négatif) entre aujourd'hui et une date ISO. */
export function joursAvant(dateIso: string): number {
  const cible = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`).getTime()
  const today = new Date(`${todayIso()}T00:00:00Z`).getTime()
  return Math.round((cible - today) / 86_400_000)
}
