import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  RowContextMenuContent,
  type RowAction,
} from '@/components/common/row-actions'

/**
 * Vrai quand le texte de l'élément est COUPÉ à l'écran (points de suspension
 * d'un `truncate`, lignes retirées d'un `line-clamp`) : seule raison d'afficher
 * une infobulle (demande PO). Re-mesuré à chaque changement de taille.
 */
export function useTexteTronque(texte: string | null | undefined) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const [tronque, setTronque] = useState(false)
  const ref = useCallback((el: HTMLElement | null) => setElement(el), [])

  useEffect(() => {
    if (!element) return
    // L'observateur mesure dès qu'il commence à observer, puis à chaque
    // changement de taille ; relancé quand le texte change.
    const observer = new ResizeObserver(() =>
      setTronque(
        element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1,
      ),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, texte])

  return [ref, element !== null && tronque] as const
}

/**
 * Enveloppe une case du schéma de ses deux couches d'interaction :
 * - au SURVOL, une infobulle de l'application avec le texte COMPLET — et
 *   seulement lui, seulement s'il est coupé dans la case (demande PO : ne pas
 *   redire ce qui se voit déjà) ;
 * - au CLIC DROIT / appui long, son menu.
 *
 * Ordre imposé par Radix : les racines (`Tooltip`, `ContextMenu`) n'ont pas de
 * nœud DOM, seuls leurs déclencheurs `asChild` se composent — d'où
 * ContextMenuTrigger > TooltipTrigger > la case.
 */
export function SurvolCase({
  texte,
  menu = [],
  children,
}: {
  /** Texte à montrer au survol ; absent = pas d'infobulle. */
  texte?: string | null
  menu?: RowAction[]
  children: ReactElement
}) {
  const avecInfo = Boolean(texte?.trim())
  const declencheur = avecInfo ? (
    <TooltipTrigger asChild>{children}</TooltipTrigger>
  ) : (
    children
  )
  const avecMenu =
    menu.length === 0 ? (
      declencheur
    ) : (
      <ContextMenu modal={false}>
        <ContextMenuTrigger asChild>{declencheur}</ContextMenuTrigger>
        <RowContextMenuContent actions={menu} />
      </ContextMenu>
    )
  if (!avecInfo) return avecMenu
  return (
    <Tooltip>
      {avecMenu}
      <TooltipContent
        side="bottom"
        align="start"
        className="max-w-sm px-3 py-2 text-left leading-relaxed font-normal whitespace-pre-line"
      >
        {texte}
      </TooltipContent>
    </Tooltip>
  )
}
