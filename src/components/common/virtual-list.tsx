import { useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

/** Premier ancêtre qui défile verticalement (le `ScrollBody` de la page). */
function zoneDefilante(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

interface VirtualListProps<T> {
  items: readonly T[]
  /** Clé stable d'une ligne (son id) : garde la mesure et le focus au bon endroit. */
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
}

/**
 * Liste VIRTUALISÉE : seules les lignes visibles (et quelques-unes autour) sont
 * dans la page, quelle que soit la longueur de la liste.
 *
 * Pourquoi : la page Demandes porte tout l'historique Dmbook (4 000+ DI depuis
 * 2021). Rendre 4 000 `ListRow` — chacune avec son menu contextuel — rendait la
 * page lourde à l'ouverture, à chaque frappe dans la recherche et à chaque
 * rafraîchissement temps réel.
 *
 * Elle défile avec la page : elle se branche sur la zone défilante qui la contient
 * (le `ScrollBody` de `PageContainer`), sans barre de défilement à elle. Les
 * hauteurs sont mesurées, donc une ligne sur deux lignes (mobile) reste juste.
 * Les lignes gardent leur mise en forme : elle remplace seulement la boucle
 * `items.map(...)` dans `ListPageBody`.
 */
export function VirtualList<T>({
  items,
  getKey,
  renderItem,
}: VirtualListProps<T>) {
  const [liste, setListe] = useState<HTMLDivElement | null>(null)
  const zone = zoneDefilante(liste)
  // Position de la liste dans la zone défilante (la barre de recherche est au-dessus).
  const marge =
    liste && zone
      ? liste.getBoundingClientRect().top -
        zone.getBoundingClientRect().top +
        zone.scrollTop
      : 0

  // Avertissement « incompatible library » attendu : React Compiler ne mémoïse pas
  // ce composant (les fonctions du virtualiseur changent à chaque défilement). C'est voulu.
  const v = useVirtualizer({
    count: items.length,
    getScrollElement: () => zone,
    // Hauteur estimée d'une ligne, en px ; la vraie hauteur est mesurée ensuite.
    estimateSize: () => 72,
    getItemKey: (i) => {
      const item = items[i]
      return item === undefined ? i : getKey(item)
    },
    // Espace entre deux lignes, en px (8 = `listStack`).
    gap: 8,
    overscan: 8,
    scrollMargin: marge,
  })

  return (
    <div
      ref={setListe}
      className="relative w-full"
      style={{ height: v.getTotalSize() }}
    >
      {v.getVirtualItems().map((ligne) => {
        const item = items[ligne.index]
        if (item === undefined) return null
        return (
          <div
            key={ligne.key}
            data-index={ligne.index}
            ref={v.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${String(ligne.start - marge)}px)`,
            }}
          >
            {renderItem(item)}
          </div>
        )
      })}
    </div>
  )
}
