import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ordresTravailQueries } from '@/features/ordres-travail/queries'
import { OT_QUERY_KEYS } from '@/features/ordres-travail/query-keys'
import type { OtTriable } from '@/features/ordres-travail/tri'
import { useRealtimeRefresh } from '@/hooks/use-realtime-refresh'
import type { CatalogueDrillCat } from '@/hooks/use-catalogue-drill'
import {
  statutAffichageAgrege,
  type GammeStatutInput,
} from './statut-affichage'
import type { GammeRow } from './components/gamme-detail'

/** Catégorie de gamme (scope 'gamme'/'mixte') telle que consommée pour les badges. */
interface GammeCat {
  id: string
  parent_id: string | null
}

/** Entrées nécessaires au calcul des badges de statut agrégés du palier affiché. */
export interface UseGammeBadgesParams {
  siteId: string
  /** Profondeur du drill courant (0 = racine catégories, 1 = sous-catégories, ≥2 = gammes). */
  depth: number
  /** Catégories/sous-catégories réelles visibles (scope gamme/mixte, actives, du site/commun). */
  gammeCats: GammeCat[]
  /** Toutes les gammes du site. */
  gammes: GammeRow[]
  /** Gammes orphelines (bac virtuel « Non classé »). */
  orphans: GammeRow[]
  /** Gammes listées sous le nœud courant (GammeCard). */
  gammesInCurrent: GammeRow[]
  /** Catégories/sous-catégories affichées au palier (CategorieCard / SousCategorieCard). */
  childCategories: CatalogueDrillCat[]
}

/** Ce que le composant consomme pour peindre les badges de statut. */
export interface UseGammeBadgesResult {
  /** OT par gamme (gamme_id → OT), pour le badge d'une GammeCard. */
  otsParGamme: Map<string, OtTriable[]>
  /** Badges indisponibles (fetch réel en cours ou erreur) → masquer les badges. */
  otsBadgesIndispo: boolean
  /** Badge de statut AGRÉGÉ par catégorie/sous-catégorie affichée (node.id → statut). */
  statutParNode: Map<string, ReturnType<typeof statutAffichageAgrege>>
}

/**
 * Badges de statut AGRÉGÉS du Plan de maintenance (extrait de `GammesExplorer`).
 *
 * Charge les OT du palier affiché puis en dérive, par la MÊME règle à tous les
 * niveaux (`statutAffichageAgrege`), le badge/urgence de chaque carte de gamme et de
 * chaque carte de catégorie/sous-catégorie. 100 % dérivé des OT (aucune table) — les
 * badges suivent clôtures/réouvertures via le realtime OT.
 */
export function useGammeBadges({
  siteId,
  depth,
  gammeCats,
  gammes,
  orphans,
  gammesInCurrent,
  childCategories,
}: UseGammeBadgesParams): UseGammeBadgesResult {
  // Gammes (rows) sous un nœud de l'arbre AFFICHÉ : catégorie (depth 0) → gammes de
  // TOUTES ses sous-catégories ; sous-catégorie (depth 1) → ses gammes directes ; bac
  // « Non classé » virtuel → les orphelines. Sert au calcul des ids à charger ET au
  // badge agrégé de la carte (MÊME règle à tous les niveaux).
  const gammeRowsUnderNode = useCallback(
    (node: CatalogueDrillCat): GammeRow[] => {
      if (node.virtual) return orphans
      if (depth === 0) {
        const sousCatIds = new Set(
          gammeCats.filter((c) => c.parent_id === node.id).map((c) => c.id),
        )
        return gammes.filter((g) => sousCatIds.has(g.categorie_id))
      }
      return gammes.filter((g) => g.categorie_id === node.id)
    },
    [depth, gammeCats, gammes, orphans],
  )

  // OT à charger pour les badges du palier : gammes LISTÉES (GammeCard) + gammes sous
  // chaque catégorie / sous-catégorie affichée (badge AGRÉGÉ). Au palier
  // sous-catégorie, la clé byGammes est PARTAGÉE avec le panneau OT du bas
  // (SousCategorieSplit → OtListeParGammes) → pas de double fetch. Realtime OT pour
  // que les badges suivent clôtures/réouvertures — NÉCESSAIRE aux paliers
  // catégorie/sous-catégorie où le panneau OT n'est pas (toujours) rendu.
  const gammeIdsBadges = useMemo(() => {
    const ids = new Set<string>()
    for (const g of gammesInCurrent) ids.add(g.id)
    for (const node of childCategories)
      for (const g of gammeRowsUnderNode(node)) ids.add(g.id)
    return [...ids]
  }, [gammesInCurrent, childCategories, gammeRowsUnderNode])
  const otsParGammeQuery = useQuery(
    ordresTravailQueries.byGammes(siteId, gammeIdsBadges),
  )
  useRealtimeRefresh('ordres_travail', OT_QUERY_KEYS)
  // Badges INDISPONIBLES : seulement pendant un fetch réel (`isLoading` — PAS
  // `isPending`, qui reste vrai pour une requête DÉSACTIVÉE quand il n'y a aucune
  // gamme à charger, ce qui masquerait à tort « Vide »), ou en cas d'erreur (on évite
  // d'afficher un statut trompeur calculé sur des OT absents).
  const otsBadgesIndispo =
    otsParGammeQuery.isLoading || otsParGammeQuery.isError
  const otsParGamme = useMemo(() => {
    const map = new Map<string, OtTriable[]>()
    for (const ot of otsParGammeQuery.data ?? []) {
      if (ot.gamme_id === null) continue
      const liste = map.get(ot.gamme_id) ?? []
      liste.push(ot)
      map.set(ot.gamme_id, liste)
    }
    return map
  }, [otsParGammeQuery.data])
  // Gammes (activité + OT) sous un nœud, pour le badge AGRÉGÉ (pire cas — cf.
  // statutAffichageAgrege) de sa CategorieCard / SousCategorieCard.
  const gammesStatutUnderNode = useCallback(
    (node: CatalogueDrillCat): GammeStatutInput[] =>
      gammeRowsUnderNode(node).map((g) => ({
        estActive: g.est_active,
        ots: otsParGamme.get(g.id) ?? [],
      })),
    [gammeRowsUnderNode, otsParGamme],
  )
  // Badge de statut AGRÉGÉ par catégorie/sous-catégorie affichée, MÉMOÏSÉ :
  // l'agrégation + le tri par urgence de TOUS les OT du palier ne se recalculent que
  // si les nœuds affichés ou leurs OT changent — plus à chaque re-render (ouverture
  // de dialog, frappe dans le formulaire catégorie…). Map vide pendant le fetch / sur
  // erreur → badges masqués (cf. statutPending).
  const statutParNode = useMemo(() => {
    const map = new Map<string, ReturnType<typeof statutAffichageAgrege>>()
    if (otsBadgesIndispo) return map
    for (const node of childCategories)
      map.set(
        node.id,
        statutAffichageAgrege({ gammes: gammesStatutUnderNode(node) }),
      )
    return map
  }, [childCategories, gammesStatutUnderNode, otsBadgesIndispo])

  return { otsParGamme, otsBadgesIndispo, statutParNode }
}
