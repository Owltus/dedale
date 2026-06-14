import type { MiniatureWithUrl } from './queries'

/**
 * Filtre d'ORIGINE d'une vignette : `'all'` (toutes), `'inutilisee'` (aucune
 * référence), ou un code d'origine présent dans `miniature.origines`.
 */
export type OrigineFiltre =
  | 'all'
  | 'inutilisee'
  | 'equipement'
  | 'operation'
  | 'plan_maintenance'
  | 'di'
  | 'lieux'

/** Puces de filtre par origine, dans l'ordre d'affichage. */
export const ORIGINE_FILTRES: { value: OrigineFiltre; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'equipement', label: 'Équipement' },
  { value: 'operation', label: 'Opération' },
  { value: 'plan_maintenance', label: 'Plan de maintenance' },
  { value: 'di', label: 'DI' },
  { value: 'lieux', label: 'Lieux & prestataires' },
  { value: 'inutilisee', label: 'Inutilisées' },
]

/**
 * Applique le filtre d'origine + la recherche (sur les noms des entités liées)
 * à une liste de vignettes. Indépendant du filtre de PÉRIMÈTRE (commun/site),
 * qui reste géré en amont par chaque écran.
 */
export function filterMiniatures(
  list: MiniatureWithUrl[],
  origine: OrigineFiltre,
  recherche: string,
): MiniatureWithUrl[] {
  const q = recherche.trim().toLowerCase()
  return list.filter((m) => {
    const origineOk =
      origine === 'all'
        ? true
        : origine === 'inutilisee'
          ? m.origines.length === 0
          : m.origines.includes(origine)
    if (!origineOk) return false
    if (q === '') return true
    return m.libelles.toLowerCase().includes(q)
  })
}
