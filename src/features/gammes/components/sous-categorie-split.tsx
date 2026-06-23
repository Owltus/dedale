import type { ReactNode } from 'react'
import { OtListeParGammes } from '@/features/ordres-travail/components/ot-liste-par-gammes'
import { SplitPane, SplitPanes } from '@/components/common/split-panes'

/** Étiquette discrète de panneau (uppercase atténuée). */
function PaneLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-muted-foreground shrink-0 text-xs font-medium tracking-wide uppercase">
      {children}
    </h2>
  )
}

/**
 * Palier SOUS-CATÉGORIE du Plan de maintenance en SPLIT 50/50 vertical (brique
 * `SplitPanes`) : en HAUT les gammes de la sous-catégorie (rendu fourni par le
 * parent via `children`), en BAS TOUS les ordres de travail rattachés à ces
 * gammes. À utiliser sous `PageContainer fill`.
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
    <SplitPanes>
      <SplitPane header={<PaneLabel>Gammes</PaneLabel>}>{children}</SplitPane>
      <SplitPane header={<PaneLabel>Ordres de travail</PaneLabel>}>
        <OtListeParGammes siteId={siteId} gammeIds={gammeIds} />
      </SplitPane>
    </SplitPanes>
  )
}
