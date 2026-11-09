import type { StatusTone } from '@/components/common/status-badge'
import { NATURES_OBLIGATION } from '@/features/gammes/natures-obligation'
import { prochaineDateOt } from '@/features/gammes/prochaine-date'
import { estPlanifieEnRetard } from '@/features/ordres-travail/statut-affichage'
import { dateSemaineOt, type PlanningOt } from '@/features/planning/grille'
import {
  isoLocale,
  lundiDeLaSemaine,
  minuit,
  parseDateLocale,
} from '@/lib/date'

/**
 * État d'un passage sur la frise des obligations. La distinction qui compte
 * pour le PO : « planifié » (date posée par un humain, violet) contre
 * « programmé » (date posée par l'application, gris) contre « estimé » (passage
 * futur qui n'existe pas encore, calculé d'après la périodicité, cercle creux).
 * Les interventions FAITES ne figurent pas : la frise regarde l'avenir (PO).
 */
export type EtatJalon =
  | 'retard'
  | 'en_cours'
  | 'rouvert'
  | 'planifie'
  | 'programme'
  | 'estime'

export const ETAT_JALON: Record<
  EtatJalon,
  { libelle: string; tone: StatusTone; creux?: boolean }
> = {
  retard: { libelle: 'En retard', tone: 'destructive' },
  en_cours: { libelle: 'En cours', tone: 'info' },
  rouvert: { libelle: 'Rouvert', tone: 'rose' },
  planifie: { libelle: 'Planifié par vous', tone: 'violet' },
  programme: { libelle: "Programmé par l'application", tone: 'neutral' },
  estime: { libelle: 'Estimé (pas encore créé)', tone: 'neutral', creux: true },
}

/**
 * Priorité d'un mois qui mélange plusieurs passages : c'est le MOINS
 * organisé qui l'emporte (retard, puis rouvert, en cours, programmé par
 * l'application, estimé, et enfin planifié par vous), pour qu'un passage non
 * organisé ne soit jamais caché par un passage déjà planifié. Sert aussi
 * d'ordre de légende.
 */
export const ORDRE_LEGENDE: EtatJalon[] = [
  'retard',
  'rouvert',
  'en_cours',
  'programme',
  'estime',
  'planifie',
]

export interface GammeFrise {
  id: string
  nom: string
  nature: PlanningOt['nature_gamme']
  est_active: boolean
  /** Périodicité en jours (0 = ponctuelle → aucun passage estimé). */
  jours: number
}

export interface Jalon {
  cle: string
  gammeId: string
  gammeNom: string
  /** Date affichée `AAAA-MM-JJ` (clôture, début ou prévue selon l'état). */
  date: string
  etat: EtatJalon
  /** OT réel (`null` pour un passage estimé). */
  otId: string | null
}

export interface BandeNature {
  nature: PlanningOt['nature_gamme']
  libelle: string
  couleur: string
  jalons: Jalon[]
}

/** Garde-fou : jamais plus de passages estimés par gamme (périodicité courte). */
const MAX_ESTIMES = 400

function etatOt(ot: PlanningOt, aujourdHui: Date): EtatJalon | null {
  switch (ot.statut) {
    case 'cloture':
    case 'annule':
      return null
    case 'en_cours':
      return 'en_cours'
    case 'reouvert':
      return 'rouvert'
    default:
      if (estPlanifieEnRetard(ot, aujourdHui)) return 'retard'
      return ot.origine === 'programme' ? 'programme' : 'planifie'
  }
}

/**
 * Base de la chaîne des passages estimés d'une gamme :
 *   - un OT ouvert existe → sa date prévue, mais jamais avant la semaine
 *     courante (un OT en retard ou en cours ne sera clôturé qu'à partir
 *     d'aujourd'hui, et la base recalcule depuis la clôture) ;
 *   - sinon → la dernière clôture (c'est d'elle que la base repart).
 */
function baseEstimation(ots: PlanningOt[], aujourdHui: Date): Date | null {
  const lundi = lundiDeLaSemaine(aujourdHui)
  const ouverts = ots.filter(
    (o) => o.statut !== 'cloture' && o.statut !== 'annule',
  )
  if (ouverts.length > 0) {
    const plusLoin = ouverts
      .map((o) => parseDateLocale(o.date_prevue))
      .reduce((a, b) => (b > a ? b : a))
    return plusLoin < lundi ? lundi : plusLoin
  }
  const clotures = ots
    .filter((o) => o.statut === 'cloture' && o.date_cloture !== null)
    .map((o) => parseDateLocale(o.date_cloture!))
  if (clotures.length === 0) return null
  return clotures.reduce((a, b) => (b > a ? b : a))
}

/**
 * Construit les trois bandes de la frise (une par nature d'obligation), avec
 * les passages RÉELS (OT existants, annulés exclus) et ESTIMÉS (chaîne
 * `prochaineDateOt` à partir de la base, pour les gammes actives et
 * périodiques), bornés à `[debut ; fin]`. Fonction pure.
 */
export function construireBandes(params: {
  gammes: GammeFrise[]
  ots: PlanningOt[]
  debut: Date
  fin: Date
  aujourdHui?: Date
}): BandeNature[] {
  const aujourdHui = minuit(params.aujourdHui ?? new Date())
  const t0 = minuit(params.debut).getTime()
  const t1 = minuit(params.fin).getTime()
  const dansFenetre = (d: Date) => d.getTime() >= t0 && d.getTime() <= t1

  const otsParGamme = new Map<string, PlanningOt[]>()
  for (const ot of params.ots) {
    if (ot.gamme_id === null) continue
    const arr = otsParGamme.get(ot.gamme_id)
    if (arr) arr.push(ot)
    else otsParGamme.set(ot.gamme_id, [ot])
  }

  return NATURES_OBLIGATION.map((n) => {
    const jalons: Jalon[] = []
    const gammes = params.gammes
      .filter((g) => g.nature === n.nature)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))

    for (const g of gammes) {
      const ots = otsParGamme.get(g.id) ?? []
      for (const ot of ots) {
        const etat = etatOt(ot, aujourdHui)
        if (etat === null) continue
        const d = dateSemaineOt(ot)
        if (!dansFenetre(d)) continue
        jalons.push({
          cle: `ot:${ot.id}`,
          gammeId: g.id,
          gammeNom: g.nom,
          date: isoLocale(d),
          etat,
          otId: ot.id,
        })
      }

      if (!g.est_active || g.jours <= 0) continue
      let d = baseEstimation(ots, aujourdHui)
      for (let k = 0; d !== null && k < MAX_ESTIMES; k += 1) {
        d = prochaineDateOt(d, g.jours)
        if (d === null || d.getTime() > t1) break
        if (dansFenetre(d))
          jalons.push({
            cle: `est:${g.id}:${isoLocale(d)}`,
            gammeId: g.id,
            gammeNom: g.nom,
            date: isoLocale(d),
            etat: 'estime',
            otId: null,
          })
      }
    }

    jalons.sort((a, b) => a.date.localeCompare(b.date))
    return { nature: n.nature, libelle: n.libelle, couleur: n.couleur, jalons }
  })
}

/** Un mois d'une bande : tous ses passages et l'état qui le colore. */
export interface MoisBande {
  /** Premier jour du mois (AAAA-MM-01). */
  debut: string
  etat: EtatJalon
  jalons: Jalon[]
}

/**
 * Regroupe les passages d'une bande par MOIS (une marque par mois : des
 * carrés assez grands pour être lisibles, demande PO du 09/11/2026). L'état
 * affiché suit ORDRE_LEGENDE. Fonction pure.
 */
export function regrouperParMois(jalons: Jalon[]): MoisBande[] {
  const parMois = new Map<string, Jalon[]>()
  for (const j of jalons) {
    const debut = `${j.date.slice(0, 7)}-01`
    const arr = parMois.get(debut)
    if (arr) arr.push(j)
    else parMois.set(debut, [j])
  }
  return [...parMois.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([debut, js]) => ({
      debut,
      jalons: js,
      etat: ORDRE_LEGENDE.find((e) => js.some((j) => j.etat === e)) ?? 'estime',
    }))
}
