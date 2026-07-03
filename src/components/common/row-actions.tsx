import { Fragment } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Pencil, Trash2 } from 'lucide-react'
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
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
  /** Affiche un séparateur AVANT cet item (pour grouper, ex. le bloc « statut »). */
  separatorBefore?: boolean
  /** Classe de couleur de l'icône (ex. 'text-warning', 'text-muted-foreground'). */
  iconClassName?: string
}

/**
 * Fabrique le duo d'actions standard « Modifier » / « Supprimer » d'une ligne
 * (libellés, icônes et `destructive` homogènes sur toutes les pages liste).
 * N'inclut que les entrées dont le callback est fourni — les gardes de
 * permission restent côté page (on ne passe le callback QUE si autorisé).
 */
export function actionsEditionSuppression({
  onModifier,
  onSupprimer,
  separatorBefore,
}: {
  onModifier?: () => void
  onSupprimer?: () => void
  /** Sépare le duo des actions précédentes (posé sur la 1re entrée rendue). */
  separatorBefore?: boolean
}): RowAction[] {
  const actions: RowAction[] = []
  if (onModifier) {
    actions.push({
      label: 'Modifier',
      icon: Pencil,
      onSelect: onModifier,
      separatorBefore,
    })
  }
  if (onSupprimer) {
    actions.push({
      label: 'Supprimer',
      icon: Trash2,
      destructive: true,
      onSelect: onSupprimer,
      // Le séparateur ne précède que la PREMIÈRE entrée du duo.
      separatorBefore: separatorBefore === true && actions.length === 0,
    })
  }
  return actions
}

// L'item destructif passe AUSSI le focus en rouge (sinon focus:text-accent-foreground
// du style de base reprendrait le dessus).
const itemClass = (destructive?: boolean) =>
  destructive ? 'text-destructive focus:text-destructive' : undefined

/**
 * Contenu du MENU CONTEXTUEL (à placer dans un `<ContextMenu>`). Rendu par
 * `ListRow` quand `menuActions` est fourni. Pas de déclencheur visible : le menu
 * s'ouvre au clic droit (desktop) ou à l'appui long (tactile). Supporte des
 * séparateurs (`separatorBefore`) et une icône colorée par item (`iconClassName`).
 */
export function RowContextMenuContent({ actions }: { actions: RowAction[] }) {
  return (
    <ContextMenuContent>
      {actions.map((a, i) => {
        const Icon = a.icon
        return (
          <Fragment key={a.label}>
            {a.separatorBefore && i > 0 && <ContextMenuSeparator />}
            <ContextMenuItem
              disabled={a.disabled}
              onSelect={a.onSelect}
              className={cn(itemClass(a.destructive))}
            >
              <Icon className={cn(a.iconClassName)} />
              {a.label}
            </ContextMenuItem>
          </Fragment>
        )
      })}
    </ContextMenuContent>
  )
}
