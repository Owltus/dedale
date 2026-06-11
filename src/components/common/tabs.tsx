import { useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipIconButton } from './tooltip-icon-button'
import {
  TabActionContext,
  TabTitleContext,
  type TabActionApi,
  type TabTitleApi,
  type TabAddConfig,
} from './tab-actions'

export interface TabItem {
  id: string
  /** Libellé du bouton d'onglet (texte ou nœud, ex. libellé sur 2 lignes). */
  label: ReactNode
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
  // Nœud de titre personnalisé fourni par le panneau actif (ex. fil d'Ariane).
  // `null` → titre par défaut (`title`).
  const [titleNode, setTitleNode] = useState<ReactNode | null>(null)
  const activeItem = items.find((t) => t.id === active) ?? items[0]

  // API stable transmise aux panneaux pour enregistrer leur action + / leur titre.
  const [api] = useState<TabActionApi>(() => ({ setAction: setAddConfig }))
  const [titleApi] = useState<TabTitleApi>(() => ({ setTitle: setTitleNode }))

  // Locaux : le narrowing TS sur addConfig.action ne traverse pas le JSX imbriqué.
  const addAction = addConfig?.action ?? null
  const addLabel = addConfig?.label ?? 'Ajouter'
  const addDisabled = addConfig?.disabled ?? false
  const addExtra = addConfig?.extra

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b px-4 pt-6 pb-3 sm:px-6 lg:px-8">
        <div className="mb-3 flex items-center justify-between gap-4">
          {titleNode ?? (
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
              {title}
            </h1>
          )}
          {addConfig !== null && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {addExtra}
              {addAction !== null && (
                <TooltipIconButton
                  icon={<Plus />}
                  label={addLabel}
                  onClick={addAction}
                  disabled={addDisabled}
                  variant="default"
                />
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
                  'flex flex-1 cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors',
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
        <TabTitleContext.Provider value={titleApi}>
          <div
            role="tabpanel"
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8"
          >
            {activeItem?.content}
          </div>
        </TabTitleContext.Provider>
      </TabActionContext.Provider>
    </div>
  )
}
