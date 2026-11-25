import { useQuery } from '@tanstack/react-query'
import { localisationsQueries, type LieuDetail } from './queries'
import { segmentsLieu } from './lien-lieu'

/**
 * Adresse d'un lieu à partir de son seul `local_id` : lit le lieu (chemin,
 * bâtiment, niveau) puis les frères de chaque palier — les MÊMES requêtes que
 * l'explorateur, donc partagées en cache — et en tire les segments symétriques.
 *
 * `segs` vaut `null` tant que tout n'est pas chargé, ou si le lieu n'est pas
 * visible (supprimé, hors des sites) : l'appelant retombe alors sur du texte.
 */
export function useLienLieu(localId: string | null): {
  segs: string[] | null
  lieu: LieuDetail | null
} {
  const { data: lieu = null } = useQuery(localisationsQueries.local(localId))
  const { data: batiments } = useQuery(
    localisationsQueries.batiments(lieu?.site_id ?? null),
  )
  const { data: niveaux } = useQuery(
    localisationsQueries.niveaux(lieu?.batiment_id ?? null),
  )
  const { data: locaux } = useQuery(
    localisationsQueries.locaux(lieu?.niveau_id ?? null),
  )
  if (!lieu?.batiment_id || !batiments || !niveaux || !locaux) {
    return { segs: null, lieu }
  }
  const segs = segmentsLieu(
    { id: lieu.id, niveauId: lieu.niveau_id, batimentId: lieu.batiment_id },
    { batiments, niveaux, locaux },
  )
  return { segs, lieu }
}
