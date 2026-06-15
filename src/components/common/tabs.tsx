import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { SelectMenu } from './select-menu'
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
  /**
   * Libellé en TEXTE BRUT : sert d'option au menu déroulant mobile (qui remplace
   * la barre d'onglets sous `sm`) et de nom accessible. Indispensable car `label`
   * peut être un nœud non textuel.
   */
  labelText: string
  /** Contenu rendu uniquement quand l'onglet est actif (montage paresseux). */
  content: ReactNode
}

interface TabsProps {
  items: TabItem[]
  /** Onglet actif initial (mode NON contrôlé uniquement ; défaut : le premier). */
  defaultTabId?: string
  /**
   * Titre GÉNÉRIQUE de la page, affiché dans la barre tant que l'onglet actif n'a
   * pas fourni son propre titre via `useTabTitle` — c.-à-d. à la RACINE de chaque
   * onglet. On y montre « Bibliothèque », pas le nom de l'onglet actif (ce serait
   * redondant avec le bouton d'onglet déjà surligné). Dès qu'on descend dans un
   * onglet, le panneau surcharge ce titre par son fil d'Ariane. Repli ultime
   * (titre absent) : le libellé de l'onglet actif.
   */
  title?: string
  /**
   * Mode CONTRÔLÉ : id de l'onglet actif. Si fourni, il prime sur le state
   * interne (la source de vérité devient le parent, ex. un search param d'URL).
   * Absent → mode non contrôlé historique (state interne, inchangé).
   */
  value?: string
  /** Notifié au clic d'un onglet (typiquement pour MAJ le `value` contrôlé). */
  onValueChange?: (id: string) => void
}

/**
 * Onglets pleine largeur (boutons). Le titre + la barre d'onglets forment une
 * zone FIXE en haut ; seul le panneau actif défile dessous. À droite du titre :
 * un bouton « + » mutualisé (avec tooltip) et un éventuel contrôle `extra` —
 * tous deux fournis par le panneau actif via `useTabAddAction` (cf.
 * ./tab-actions). Nécessite un parent à hauteur bornée (cf. <PageContainer fill>).
 */
export function Tabs({
  items,
  defaultTabId,
  title,
  value,
  onValueChange,
}: TabsProps) {
  // Mode contrôlé si `value` est fourni : l'onglet actif vient alors du parent,
  // le state interne sert de repli pour l'usage non contrôlé.
  const [internalActive, setInternalActive] = useState(
    defaultTabId ?? items[0]?.id,
  )
  const isControlled = value !== undefined
  const active = isControlled ? value : internalActive

  function selectTab(id: string) {
    // Re-cliquer l'onglet ACTIF re-navigue volontairement vers la RACINE de
    // l'onglet (`/bibliotheque/<onglet>`) : c'est l'affordance « remonter tout
    // en haut » pour Gammes (la descente cat/sous/gamme est réinitialisée).
    // Pour les autres onglets, l'URL est déjà la racine → re-clic = no-op/replace.
    onValueChange?.(id)
    if (!isControlled) setInternalActive(id)
  }

  const [addConfig, setAddConfig] = useState<TabAddConfig | null>(null)
  // Nœud de titre personnalisé fourni par le panneau actif (ex. fil d'Ariane).
  // `null` → titre par défaut (`title`).
  const [titleNode, setTitleNode] = useState<ReactNode | null>(null)
  const activeItem = items.find((t) => t.id === active) ?? items[0]

  // Pattern WAI-ARIA Tabs : ids stables reliant chaque onglet à son panneau, et
  // navigation au clavier (flèches + Début/Fin) avec roving tabIndex.
  const tablistRef = useRef<HTMLDivElement>(null)

  function focusTabAt(index: number) {
    const buttons =
      tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[index]?.focus()
  }

  function onTablistKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = items.findIndex((t) => t.id === activeItem?.id)
    if (current < 0) return
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (current + 1) % items.length
    else if (e.key === 'ArrowLeft')
      next = (current - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    if (next === null) return
    e.preventDefault()
    const target = items[next]
    if (!target) return
    selectTab(target.id)
    focusTabAt(next)
  }

  // Sécurité : si la barre d'onglets (desktop, `sm:flex`) déborde, on ramène
  // l'onglet actif dans le champ visible. Défilement HORIZONTAL uniquement (via
  // `scrollLeft`) → ne perturbe JAMAIS le défilement vertical du panneau, et
  // garde `block:'nearest'` n'aurait pas suffi (scrollIntoView remonte la chaîne
  // des conteneurs scrollables). Avec les libellés courts la barre tient sans
  // scroll dès `sm` ; ce garde reste utile si un libellé s'allonge.
  useEffect(() => {
    const list = tablistRef.current
    if (!list || list.scrollWidth <= list.clientWidth) return
    const btn = list.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-selected="true"]',
    )
    if (!btn) return
    const target = btn.offsetLeft - (list.clientWidth - btn.clientWidth) / 2
    list.scrollTo({ left: Math.max(0, target), behavior: 'auto' })
  }, [active])

  // API stable transmise aux panneaux pour enregistrer leur action + / leur titre.
  const [api] = useState<TabActionApi>(() => ({ setAction: setAddConfig }))
  const [titleApi] = useState<TabTitleApi>(() => ({ setTitle: setTitleNode }))

  // Locaux : le narrowing TS sur addConfig.action ne traverse pas le JSX imbriqué.
  const addAction = addConfig?.action ?? null
  const addLabel = addConfig?.label ?? 'Ajouter'
  const addDisabled = addConfig?.disabled ?? false
  const addExtra = addConfig?.extra
  const addActions = addConfig?.actions

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-6 pb-3 sm:px-6 lg:px-8">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Région live : le changement de contexte (onglet actif ou descente
              dans un onglet) est annoncé aux lecteurs d'écran via le titre.
              Toujours en 1re ligne, à gauche, et prend l'espace disponible. */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="order-1 flex min-w-0 flex-1 items-center"
          >
            {titleNode ?? (
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
                {title ?? activeItem?.label}
              </h1>
            )}
          </div>
          {addConfig !== null && (
            <>
              {/* Extra (filtre de périmètre / indicateur d'origine) : à droite du
                  titre sur BUREAU uniquement. Sur mobile il descend sur la même
                  ligne que le menu des sections (cf. bloc `sm:hidden` plus bas),
                  car sa largeur (sélecteur) écraserait le titre sinon. */}
              {addExtra !== undefined && (
                <div className="order-3 hidden w-full flex-wrap items-center gap-2 sm:order-2 sm:flex sm:w-auto">
                  {addExtra}
                </div>
              )}
              {/* Boutons d'action compacts (Copier/Modifier, actions de masse…)
                  + bouton « + » : restent EN HAUT À DROITE, à côté du titre —
                  même position qu'en bureau, mobile compris (étroits, ils
                  n'écrasent pas le titre). Seul l'`extra` (filtre large) se replie. */}
              {(addActions !== undefined || addAction !== null) && (
                <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3">
                  {addActions}
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
            </>
          )}
        </div>

        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Sections"
          onKeyDown={onTablistKeyDown}
          className="hidden w-full gap-1 overflow-x-auto sm:flex"
        >
          {items.map((tab) => {
            const selected = tab.id === activeItem?.id
            return (
              <button
                key={tab.id}
                id={`onglet-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`panneau-${tab.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                className={cn(
                  'focus-visible:ring-ring flex shrink-0 cursor-pointer items-center justify-center rounded-md px-3 py-1.5 text-center text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none sm:flex-1',
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

        {/* Mobile : menu déroulant des sections + sélecteur de périmètre sur la
            MÊME ligne. Sous `sm`, les 5 libellés ne tiennent pas côte à côte → un
            Select remplace la barre d'onglets et évite le scroll horizontal. La
            sémantique d'onglets reste portée par la barre desktop ; en descente,
            le fil d'Ariane (titre) assure le « retour racine » que le re-clic
            d'onglet offrait en bureau. Les deux dropdowns se partagent la largeur
            (`flex-1`) ; sans `extra`, le menu des sections occupe toute la ligne. */}
        <div className="flex items-center gap-2 sm:hidden">
          <SelectMenu
            aria-label="Section"
            value={activeItem?.id ?? ''}
            onChange={(e) => selectTab(e.target.value)}
            containerClassName="flex-1"
            className="w-full"
          >
            {items.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.labelText}
              </option>
            ))}
          </SelectMenu>
          {addExtra !== undefined && <div className="flex-1">{addExtra}</div>}
        </div>
      </div>

      <TabActionContext.Provider value={api}>
        <TabTitleContext.Provider value={titleApi}>
          <div
            role="tabpanel"
            id={activeItem ? `panneau-${activeItem.id}` : undefined}
            aria-labelledby={activeItem ? `onglet-${activeItem.id}` : undefined}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8"
          >
            {activeItem?.content}
          </div>
        </TabTitleContext.Provider>
      </TabActionContext.Provider>
    </div>
  )
}
