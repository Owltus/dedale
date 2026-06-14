import type { MiniatureWithUrl } from './queries'

/**
 * Filtre les vignettes par recherche sur les NOMS des entités liées (`libelles`,
 * fourni par la vue `v_miniatures_pool`). Indépendant du filtre de PÉRIMÈTRE
 * (commun/site), géré en amont par chaque écran. Recherche vide → liste inchangée.
 */
export function filterMiniatures(
  list: MiniatureWithUrl[],
  recherche: string,
): MiniatureWithUrl[] {
  const q = recherche.trim().toLowerCase()
  if (q === '') return list
  return list.filter((m) => m.libelles.toLowerCase().includes(q))
}
