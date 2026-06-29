import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Conteneur d'un SPLIT vertical de deux panneaux qui se partagent la hauteur
 * disponible — 50/50 par défaut, ou ÉQUILIBRE DYNAMIQUE si un panneau passe
 * `grow={false}` — chacun défilant indépendamment. Actif à TOUTES les tailles
 * d'écran (mobile, tablette, bureau).
 *
 * À utiliser dans un conteneur BORNÉ en hauteur (parent `flex flex-col` à hauteur
 * contrainte, cf. `PageContainer fill` sous l'app-shell plein écran, ou une zone
 * de contenu dédiée). Place exactement DEUX `SplitPane` en enfants.
 */
export function SplitPanes({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:gap-6">
      {children}
    </div>
  )
}

/**
 * Un panneau de `SplitPanes` : un en-tête FIXE (titre, étiquette, actions…) puis
 * un contenu qui DÉFILE (barre masquée via `no-scrollbar`).
 *
 * `grow` (défaut `true`) pilote le partage de hauteur :
 *  - `true`  → le panneau occupe sa part de l'espace (`flex-1`) ; deux panneaux
 *    `grow` ⇒ 50/50 figé.
 *  - `false` → le panneau prend sa hauteur NATURELLE, PLAFONNÉE à 50 %
 *    (`max-h-[50%] flex-initial`) : peu de contenu ⇒ panneau compact ; beaucoup ⇒
 *    plafond à 50 % avec scroll interne. L'AUTRE panneau (`grow`) absorbe alors
 *    tout l'espace restant — équilibre dynamique, pas figé.
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
        'flex min-h-0 flex-col gap-2',
        grow ? 'flex-1' : 'max-h-[50%] flex-initial',
      )}
    >
      {header}
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {children}
      </div>
    </section>
  )
}
