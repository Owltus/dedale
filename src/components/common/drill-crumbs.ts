import type { Crumb } from './breadcrumb'
import type { TreeNode } from '@/hooks/use-tree-drill'

/**
 * Construit les maillons du fil d'Ariane d'un EXPLORATEUR à paliers (drill de
 * catégories) : un maillon cliquable par nœud du chemin. Factorisé pour être
 * réutilisé par tous les explorateurs (gammes, équipements…) et onglets Bibliothèque.
 *
 * - `chain` : le chemin de nœuds à afficher (préfixe du `path` du drill).
 * - `goTo` : navigation du drill vers un chemin de nœuds.
 * - `root` : OPTIONNEL — le maillon racine (ex. « Plan de maintenance » → `goTo([])`).
 *   Omis quand la racine est portée ailleurs (onglets Bibliothèque : le fil
 *   « Bibliothèque › section » est rendu par `<Tabs>`).
 */
export function drillCrumbs<T extends TreeNode>(
  chain: T[],
  goTo: (target: T[]) => void,
  root?: { label: string; onClick: () => void },
): Crumb[] {
  const crumbs: Crumb[] = chain.map((node, i) => ({
    label: node.nom,
    onClick: () => goTo(chain.slice(0, i + 1)),
  }))
  return root ? [root, ...crumbs] : crumbs
}
