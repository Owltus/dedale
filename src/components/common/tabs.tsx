import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  TabActionContext,
  type TabActionApi,
  type TabAddConfig,
} from './tab-actions'

export interface TabItem {
  id: string
  label: string
  /** Contenu rendu uniquement quand l'onglet est actif (montage paresseux). */
  content: ReactNode
}

interface TabsProps {
  items: TabItem[]
  /** Onglet actif initial (défaut : le premier). */
  defaultTabId?: string
  /** Titre de page, affiché dans la zone fixe (à gauche du bouton +). */
  title: string
}

/**
 * Onglets pleine largeur (boutons). Le titre + la barre d'onglets forment une
 * zone FIXE en haut ; seul le panneau actif défile dessous. À droite du titre :
 * un bouton « + » mutualisé (avec tooltip) et un éventuel contrôle `extra` —
 * tous deux fournis par le panneau actif via `useTabAddAction` (cf.
 * ./tab-actions). Nécessite un parent à hauteur bornée (cf. <PageContainer fill>).
 */
export function Tabs({ items, defaultTabId, title }: TabsProps) {
  const [active, setActive] = useState(defaultTabId ?? items[0]?.id)
  const [addConfig, setAddConfig] = useState<TabAddConfig | null>(null)
  const activeItem = items.find((t) => t.id === active) ?? items[0]

  // API stable transmise aux panneaux pour enregistrer leur action +.
  const [api] = useState<TabActionApi>(() => ({ setAction: setAddConfig }))

  // Locaux : le narrowing TS sur addConfig.action ne traverse pas le JSX imbriqué.
  const addAction = addConfig?.action ?? null
  const addLabel = addConfig?.label ?? 'Ajouter'
  const addDisabled = addConfig?.disabled ?? false
  const addExtra = addConfig?.extra

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-4 pt-6 pb-3 sm:px-6 lg:px-8">
        <div className="mb-3 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {addConfig !== null && (
            <div className="flex items-center gap-2">
              {addExtra}
              {addAction !== null && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      onClick={addAction}
                      disabled={addDisabled}
                      aria-label={addLabel}
                      className="shrink-0"
                    >
                      <Plus />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{addLabel}</TooltipContent>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        <div role="tablist" aria-label="Sections" className="flex w-full gap-1">
          {items.map((tab) => {
            const selected = tab.id === activeItem?.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(tab.id)}
                className={cn(
                  'flex-1 cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors',
                  selected
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <TabActionContext.Provider value={api}>
        <div
          role="tabpanel"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8"
        >
          {activeItem?.content}
        </div>
      </TabActionContext.Provider>
    </div>
  )
}
