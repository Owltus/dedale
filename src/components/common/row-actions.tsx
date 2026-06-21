import type { LucideIcon } from 'lucide-react'
import { MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'

/**
 * Action de ligne, présentée dans le menu contextuel (clic droit / appui long)
 * ET dans le kebab « ⋮ ». La page ne passe QUE les actions autorisées (les gardes
 * de permission/condition restent côté page — cf. hétérogénéité des entités).
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
 * `ListRow` quand `menuActions` est fourni.
 */
export function RowContextMenuContent({ actions }: { actions: RowAction[] }) {
  return (
    <ContextMenuContent>
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

/**
 * Bouton kebab « ⋮ » ouvrant le MÊME jeu d'actions au clic (découvrabilité
 * desktop, et accès tactile permanent). Calque le rendu des items du menu
 * contextuel pour une cohérence parfaite.
 */
export function RowActionsKebab({
  actions,
  label = 'Actions',
}: {
  actions: RowAction[]
  label?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={label}
          className="shrink-0"
        >
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((a) => {
          const Icon = a.icon
          return (
            <DropdownMenuItem
              key={a.label}
              disabled={a.disabled}
              onSelect={a.onSelect}
              className={cn(itemClass(a.destructive))}
            >
              <Icon />
              {a.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
