import type { Crumb } from './breadcrumb'
import type { TreeNode } from '@/hooks/use-tree-drill'

/**
 * Construit les maillons du fil d'Ariane d'un EXPLORATEUR à paliers (drill de
 * catégories), AVEC les frères de chaque niveau → le `Breadcrumb` affiche alors un
 * caret ▾ sur le parent immédiat pour sauter latéralement (path bar). Factorisé pour
 * être réutilisé par tous les explorateurs génériques (gammes, équipements…).
 *
 * - `chain` : le chemin de nœuds à afficher (préfixe du `path` du drill).
 * - `allNodes` : TOUS les nœuds ouvrables (pour retrouver les frères par `parent_id`).
 * - `goTo` : navigation du drill vers un chemin de nœuds.
 * - `root` : OPTIONNEL — le maillon racine (ex. « Plan de maintenance » → `goTo([])`),
 *   sans frère. Omis quand la racine est portée ailleurs (onglets Bibliothèque : le
 *   fil « Bibliothèque › section » est rendu par `<Tabs>`).
 *
 * Frères d'un nœud = mêmes `parent_id`, lui-même exclu, triés par nom ; y aller
 * REMPLACE ce palier et tronque les descendants (`goTo([...chain.slice(0, i), frère])`).
 */
export function drillCrumbs<T extends TreeNode>(
  chain: T[],
  allNodes: T[],
  goTo: (target: T[]) => void,
  root?: { label: string; onClick: () => void },
): Crumb[] {
  const crumbs: Crumb[] = chain.map((node, i) => ({
    label: node.nom,
    onClick: () => goTo(chain.slice(0, i + 1)),
    siblings: allNodes
      .filter((c) => c.parent_id === node.parent_id && c.id !== node.id)
      .sort((a, b) => a.nom.localeCompare(b.nom))
      .map((sib) => ({
        label: sib.nom,
        onClick: () => goTo([...chain.slice(0, i), sib]),
      })),
  }))
  return root ? [root, ...crumbs] : crumbs
}
