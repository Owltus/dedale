import type { ReactElement } from 'react'
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

/** Ce qu'une case du schéma montre au survol (demande PO). */
export interface InfoSurvol {
  titre: string
  /** Ligne discrète sous le titre (date, montant, nom du PDF…). */
  sousTitre?: string | null
  /** Le contenu complet : proposition, motif, bilan, objet d'un devis. */
  texte?: string | null
}

/**
 * Enveloppe une case du schéma de ses deux couches d'interaction :
 * - au SURVOL, une infobulle de l'application avec tout son contenu (demande
 *   PO du 11/11/2026 : les cases tronquent, le survol montre tout) ;
 * - au CLIC DROIT / appui long, son menu.
 *
 * Ordre imposé par Radix : les racines (`Tooltip`, `ContextMenu`) n'ont pas de
 * nœud DOM, seuls leurs déclencheurs \`asChild\` se composent — d'où
 * ContextMenuTrigger > TooltipTrigger > la case.
 */
export function SurvolCase({
  info,
  menu = [],
  children,
}: {
  info?: InfoSurvol | null
  menu?: RowAction[]
  children: ReactElement
}) {
  const avecInfo =
    info != null && (Boolean(info.texte?.trim()) || Boolean(info.sousTitre))
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
        className="max-w-sm px-3 py-2 text-left"
      >
        <p className="font-semibold">{info.titre}</p>
        {info.sousTitre && (
          <p className="font-normal text-muted-foreground">{info.sousTitre}</p>
        )}
        {info.texte?.trim() && (
          <p className="mt-1.5 leading-relaxed font-normal whitespace-pre-line">
            {info.texte}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
