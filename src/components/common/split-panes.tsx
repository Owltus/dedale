import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Conteneur d'un SPLIT vertical de deux panneaux. Mobile-first : sous `lg`, les
 * panneaux s'empilent dans le flux normal (le PARENT défile) ; à partir de `lg`,
 * ils se partagent la hauteur disponible (50/50 par défaut, ou ÉQUILIBRE
 * DYNAMIQUE si un panneau passe `grow={false}`), chacun défilant indépendamment.
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
 * un contenu qui DÉFILE (barre masquée via `no-scrollbar`). Sous `lg`, hauteur
 * naturelle (le parent porte le défilement).
 *
 * `grow` (défaut `true`) pilote le partage de hauteur en `lg` :
 *  - `true`  → le panneau occupe sa part de l'espace (`lg:flex-1`) ; deux
 *    panneaux `grow` ⇒ 50/50 figé.
 *  - `false` → le panneau prend sa hauteur NATURELLE, PLAFONNÉE à 50 %
 *    (`lg:flex-initial lg:max-h-[50%]`) : peu de contenu ⇒ panneau compact ;
 *    beaucoup ⇒ plafond à 50 % avec scroll interne. L'AUTRE panneau (`grow`)
 *    absorbe alors tout l'espace restant — équilibre dynamique, pas figé.
 */
export function SplitPane({
  header,
  children,
  grow = true,
}: {
  header: ReactNode
  children: ReactNode
  grow?: boolean
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-2 lg:min-h-0',
        grow ? 'lg:flex-1' : 'lg:max-h-[50%] lg:flex-initial',
      )}
    >
      {header}
      <div className="no-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
        {children}
      </div>
    </section>
  )
}
