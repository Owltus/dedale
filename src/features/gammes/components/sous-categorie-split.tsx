import type { ReactNode } from 'react'
import { OtListeParGammes } from '@/features/ordres-travail/components/ot-liste-par-gammes'

/** Étiquette discrète de panneau (uppercase atténuée). */
function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-muted-foreground shrink-0 text-xs font-medium tracking-wide uppercase">
      {children}
    </h2>
  )
}

/**
 * Palier SOUS-CATÉGORIE du Plan de maintenance en écran SPLIT 50/50 vertical :
 * - HAUT : les gammes de la sous-catégorie (rendu fourni par le parent via
 *   `children`, à l'identique du reste de l'explorateur).
 * - BAS : TOUS les ordres de travail rattachés à ces gammes (cf.
 *   `OtListeParGammes`), tous statuts, en lecture.
 *
 * Mobile-first : sous `lg`, gammes puis OT empilés dans un SEUL flux scrollable
 * (porté par le parent) ; à partir de `lg`, split 50/50 à double défilement
 * indépendant. Les zones scrollables portent `no-scrollbar` → barre masquée,
 * défilement conservé. À utiliser sous `PageContainer fill`.
 */
export function SousCategorieSplit({
  siteId,
  gammeIds,
  children,
}: {
  siteId: string
  gammeIds: string[]
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:gap-6">
      {/* PANE HAUT — gammes de la sous-catégorie (50% en >= lg) */}
      <section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
        <PaneLabel>Gammes</PaneLabel>
        <div className="no-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          {children}
        </div>
      </section>

      {/* PANE BAS — ordres de travail liés (50% en >= lg) */}
      <section className="flex flex-col gap-2 lg:min-h-0 lg:flex-1">
        <PaneLabel>Ordres de travail</PaneLabel>
        <div className="no-scrollbar lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
          <OtListeParGammes
            siteId={siteId}
            gammeIds={gammeIds}
            emptyDescription="Aucun OT n'est rattaché aux gammes de cette sous-catégorie."
          />
        </div>
      </section>
    </div>
  )
}
