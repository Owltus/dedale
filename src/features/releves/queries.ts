import { queryOptions } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Module Relevés (mesures).
 *
 * Il n'existe pas de table « relevés » : une mesure est une ligne de
 * `operations_execution` dont `valeur_mesuree` est renseignée. On agrège ces
 * lignes pour reconstituer des séries temporelles.
 *
 * Liens utiles :
 *  - `operations_execution.ordre_travail_id` → `ordres_travail` (site, gamme).
 *  - `operations_execution.source_id` identifie l'opération d'origine : c'est
 *    l'identité stable d'un même « point de mesure » au fil des OT.
 *  - seuils / unité / conformité sont dénormalisés sur la ligne d'exécution
 *    (recalcul de conformité fait côté backend).
 *
 * Scope site : on filtre via l'OT parent (`ordres_travail.site_id`).
 */

/** Une ligne de mesure normalisée (valeur + date garanties). */
export interface MesureRow {
  id: string
  sourceId: string
  nom: string
  valeur: number
  date: string
  estConforme: boolean | null
  seuilMin: number | null
  seuilMax: number | null
  uniteSymbole: string | null
  uniteNom: string | null
  ordreTravailId: string
  gammeId: string | null
  nomGamme: string
}

/** Une gamme regroupant des mesures (carte de la liste). */
export interface GammeMesurable {
  /** Clé d'agrégation : gamme_id si présent, sinon le nom de gamme. */
  cle: string
  gammeId: string | null
  nomGamme: string
  nbMesures: number
  /** Date d'exécution du relevé le plus récent (ISO) ou null. */
  dernierReleve: string | null
}

/** Une série temporelle pour un point de mesure (une opération mesurée). */
export interface SerieMesure {
  /** Identité du point de mesure (source_id). */
  sourceId: string
  nom: string
  uniteSymbole: string | null
  uniteNom: string | null
  seuilMinimum: number | null
  seuilMaximum: number | null
  points: MesurePoint[]
}

export interface MesurePoint {
  executionId: string
  ordreTravailId: string
  date: string
  valeur: number
  estConforme: boolean | null
}

const SELECT_MESURE =
  'id, source_id, nom, valeur_mesuree, date_execution, est_conforme, seuil_minimum, seuil_maximum, unite_symbole, unite_nom, ordre_travail_id, ordres_travail!inner(site_id, gamme_id, nom_gamme, deleted_at)'

/**
 * Charge toutes les mesures (valeur renseignée) des OT non supprimés du site.
 * On agrège ensuite côté client (peu de lignes attendues par site, et pas de
 * vue/RPC dédiée disponible).
 */
async function fetchMesuresSite(
  siteId: string,
  signal: AbortSignal,
): Promise<MesureRow[]> {
  const { data } = await supabase
    .from('operations_execution')
    .select(SELECT_MESURE)
    .eq('ordres_travail.site_id', siteId)
    .is('ordres_travail.deleted_at', null)
    .not('valeur_mesuree', 'is', null)
    .not('date_execution', 'is', null)
    .order('date_execution', { ascending: true })
    .abortSignal(signal)
    .throwOnError()
  // Les filtres `.not(... is null)` garantissent valeur + date côté serveur ;
  // le `!inner` garantit la présence de l'OT. On normalise la ligne (le typage
  // PostgREST de l'embed n'est pas exploitable directement, d'où ce mapping).
  const rows = data as unknown as RawMesureRow[]
  return rows.map(
    (m): MesureRow => ({
      id: m.id,
      sourceId: m.source_id,
      nom: m.nom,
      valeur: m.valeur_mesuree,
      date: m.date_execution,
      estConforme: m.est_conforme,
      seuilMin: m.seuil_minimum,
      seuilMax: m.seuil_maximum,
      uniteSymbole: m.unite_symbole,
      uniteNom: m.unite_nom,
      ordreTravailId: m.ordre_travail_id,
      gammeId: m.ordres_travail.gamme_id,
      nomGamme: m.ordres_travail.nom_gamme,
    }),
  )
}

/** Forme brute renvoyée par le select (avant normalisation). */
interface RawMesureRow {
  id: string
  source_id: string
  nom: string
  valeur_mesuree: number
  date_execution: string
  est_conforme: boolean | null
  seuil_minimum: number | null
  seuil_maximum: number | null
  unite_symbole: string | null
  unite_nom: string | null
  ordre_travail_id: string
  ordres_travail: { gamme_id: string | null; nom_gamme: string }
}

/** Clé d'agrégation par gamme (gamme_id si présent, sinon nom). */
function cleGamme(m: MesureRow): string {
  return m.gammeId ?? `nom:${m.nomGamme}`
}

export const relevesQueries = {
  all: () => ['releves'] as const,

  /** Gammes « mesurables » du site (avec au moins une mesure renseignée). */
  gammes: (siteId: string | null) =>
    queryOptions({
      queryKey: [...relevesQueries.all(), 'gammes', siteId] as const,
      enabled: siteId !== null,
      queryFn: async ({ signal }) => {
        const rows = await fetchMesuresSite(siteId!, signal)
        const parGamme = new Map<string, GammeMesurable>()
        for (const m of rows) {
          const cle = cleGamme(m)
          const existant = parGamme.get(cle)
          if (existant) {
            existant.nbMesures += 1
            if (
              existant.dernierReleve === null ||
              m.date > existant.dernierReleve
            ) {
              existant.dernierReleve = m.date
            }
          } else {
            parGamme.set(cle, {
              cle,
              gammeId: m.gammeId,
              nomGamme: m.nomGamme,
              nbMesures: 1,
              dernierReleve: m.date,
            })
          }
        }
        return Array.from(parGamme.values()).sort((a, b) =>
          a.nomGamme.localeCompare(b.nomGamme, 'fr'),
        )
      },
      staleTime: 60_000,
    }),

  /**
   * Séries de mesures d'une gamme : une série par point de mesure (source_id),
   * chaque point trié par date d'exécution croissante.
   */
  series: (siteId: string | null, cleGammeCible: string | null) =>
    queryOptions({
      queryKey: [
        ...relevesQueries.all(),
        'series',
        siteId,
        cleGammeCible,
      ] as const,
      enabled: siteId !== null && cleGammeCible !== null,
      queryFn: async ({ signal }) => {
        const rows = await fetchMesuresSite(siteId!, signal)
        const parSerie = new Map<string, SerieMesure>()
        for (const m of rows) {
          if (cleGamme(m) !== cleGammeCible) continue
          const serie = parSerie.get(m.sourceId)
          const point: MesurePoint = {
            executionId: m.id,
            ordreTravailId: m.ordreTravailId,
            date: m.date,
            valeur: m.valeur,
            estConforme: m.estConforme,
          }
          if (serie) {
            serie.points.push(point)
            // Seuils/unité : on garde la valeur la plus récente non nulle
            // (les snapshots récents reflètent la définition courante).
            if (m.seuilMin !== null) serie.seuilMinimum = m.seuilMin
            if (m.seuilMax !== null) serie.seuilMaximum = m.seuilMax
            if (m.uniteSymbole !== null) serie.uniteSymbole = m.uniteSymbole
            if (m.uniteNom !== null) serie.uniteNom = m.uniteNom
          } else {
            parSerie.set(m.sourceId, {
              sourceId: m.sourceId,
              nom: m.nom,
              uniteSymbole: m.uniteSymbole,
              uniteNom: m.uniteNom,
              seuilMinimum: m.seuilMin,
              seuilMaximum: m.seuilMax,
              points: [point],
            })
          }
        }
        // Les points sont déjà ordonnés par la requête (date asc).
        return Array.from(parSerie.values()).sort((a, b) =>
          a.nom.localeCompare(b.nom, 'fr'),
        )
      },
      staleTime: 60_000,
    }),

  /** Détail léger d'un OT source, pour le dialog de traçabilité. */
  otSource: (otId: string | null) =>
    queryOptions({
      queryKey: [...relevesQueries.all(), 'ot', otId] as const,
      enabled: otId !== null,
      queryFn: async ({ signal }) => {
        const { data } = await supabase
          .from('ordres_travail')
          .select(
            'id, nom_gamme, nom_prestataire, nom_equipement, nom_localisation, statut, date_prevue, date_cloture, libelle_periodicite',
          )
          .eq('id', otId!)
          .is('deleted_at', null)
          .abortSignal(signal)
          .maybeSingle()
          .throwOnError()
        return data
      },
      staleTime: 60_000,
    }),
}
