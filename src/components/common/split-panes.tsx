import type { ReactNode } from 'react'

/**
 * Conteneur d'un SPLIT vertical de deux panneaux. Mobile-first : sous `lg`, les
 * panneaux s'empilent dans le flux normal (le PARENT défile) ; à partir de `lg`,
 * ils se partagent la hauteur disponible 50/50, chacun défilant indépendamment.
 *
 * À utiliser dans un conteneur BORNÉ en hauteur à partir de `lg` (parent
 * `flex flex-col` + `lg:overflow-hidden`, cf. `PageContainer fill` ou une zone de
 * contenu dédiée). Place exactement DEUX `SplitPane` en enfants.
 */
export function SplitPanes({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:gap-6">
      {children}
    </div>
  )
}

/**
 * Un panneau de `SplitPanes` : un en-tête FIXE (titre, étiquette, actions…) puis
 * un contenu qui DÉFILE (barre masquée via `no-scrollbar`) et occupe 50 % de la
 * hauteur en `lg`. Sous `lg`, hauteur naturelle (le parent porte le défilement).
 */
export function SplitPane({
  header,
  children,
}: {
  header: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
      {header}
      <div className="no-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {children}
      </div>
    </section>
  )
}
