import type { LucideIcon } from 'lucide-react'
import {
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

/**
 * Action de ligne, présentée dans le menu contextuel (clic droit / appui long).
 * La page ne passe QUE les actions autorisées (les gardes de permission/condition
 * restent côté page — cf. hétérogénéité des entités).
 */
export interface RowAction {
  label: string
  icon: LucideIcon
  onSelect: () => void
  /** Item en rouge (text-destructive) — jamais bg-destructive. */
  destructive?: boolean
  disabled?: boolean
}

// L'item destructif passe AUSSI le focus en rouge (sinon focus:text-accent-foreground
// du style de base reprendrait le dessus).
const itemClass = (destructive?: boolean) =>
  destructive ? 'text-destructive focus:text-destructive' : undefined

/**
 * Contenu du MENU CONTEXTUEL (à placer dans un `<ContextMenu>`). Rendu par
 * `ListRow` quand `menuActions` est fourni. Pas de déclencheur visible : le menu
 * s'ouvre au clic droit (desktop) ou à l'appui long (tactile).
 */
export function RowContextMenuContent({ actions }: { actions: RowAction[] }) {
  return (
    <ContextMenuContent
      // Sélectionner un item ouvre souvent un dialog (Modifier/Supprimer) : on
      // empêche la restauration de focus du menu d'entrer en conflit avec le dialog.
      onCloseAutoFocus={(e) => e.preventDefault()}
    >
      {actions.map((a) => {
        const Icon = a.icon
        return (
          <ContextMenuItem
            key={a.label}
            disabled={a.disabled}
            onSelect={a.onSelect}
            className={cn(itemClass(a.destructive))}
          >
            <Icon />
            {a.label}
          </ContextMenuItem>
        )
      })}
    </ContextMenuContent>
  )
}
