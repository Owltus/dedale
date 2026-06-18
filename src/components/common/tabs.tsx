import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { SelectMenu } from './select-menu'
import { cn } from '@/lib/utils'
import { TooltipIconButton } from './tooltip-icon-button'
import { PageHeader, type PageHeaderCrumb } from './page-header'
import {
  TabActionContext,
  TabHeaderContext,
  type TabActionApi,
  type TabHeaderApi,
  type TabHeader,
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
  /**
   * Description courte de l'onglet, affichée sous le titre À LA RACINE de l'onglet
   * (masquée en descente, où le fil d'Ariane porte le contexte). Optionnelle.
   */
  description?: string
  /** Contenu rendu uniquement quand l'onglet est actif (montage paresseux). */
  content: ReactNode
}

interface TabsProps {
  items: TabItem[]
  /** Onglet actif initial (mode NON contrôlé uniquement ; défaut : le premier). */
  defaultTabId?: string
  /**
   * Titre de SECTION (ex. « Bibliothèque »). Affiché en grand titre à la RACINE de
   * chaque onglet (le nom de l'onglet actif est déjà porté par le bouton surligné).
   * Dès qu'on descend, l'en-tête suit le NŒUD COURANT (titre = catégorie/modèle/
   * gamme) et ce libellé de section ouvre le fil « <section> › <onglet> › … »
   * (cf. `useTabHeader`). Repli (titre absent) : le libellé de l'onglet actif.
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
  // En-tête de descente fourni par le panneau actif (titre courant + ancêtres).
  // `null` → en-tête de section par défaut (titre = `title`, sans fil d'Ariane).
  const [tabHeader, setTabHeader] = useState<TabHeader | null>(null)
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

  // API stable transmise aux panneaux pour enregistrer leur action + / leur en-tête.
  const [api] = useState<TabActionApi>(() => ({ setAction: setAddConfig }))
  const [headerApi] = useState<TabHeaderApi>(() => ({ setHeader: setTabHeader }))

  // Locaux : le narrowing TS sur addConfig.action ne traverse pas le JSX imbriqué.
  const addAction = addConfig?.action ?? null
  const addLabel = addConfig?.label ?? 'Ajouter'
  const addDisabled = addConfig?.disabled ?? false
  const addExtra = addConfig?.extra
  const addActions = addConfig?.actions

  // --- En-tête unifié (<PageHeader>) ---
  // En descente, le titre SUIT le nœud courant (comme les explorateurs) ; à la
  // racine d'un onglet, il retombe sur le titre de section (« Bibliothèque »).
  const sectionLabel = title ?? activeItem?.labelText ?? ''
  const inDescent = tabHeader !== null
  const headerTitle = tabHeader?.title ?? sectionLabel
  // Retour à la racine de l'onglet actif (réinitialise la descente) : destination
  // commune aux deux premiers maillons « <section> › <onglet> ».
  const goOngletRoot = () => {
    if (activeItem) selectTab(activeItem.id)
  }
  // Fil d'Ariane « <section> › …ancêtres » (seulement en descente). On N'INCLUT
  // PAS le nom de l'onglet : il est déjà porté par l'onglet surligné juste à côté,
  // l'ajouter ferait doublon dans la même page.
  const headerCrumbs: PageHeaderCrumb[] | undefined = inDescent
    ? [
        { label: sectionLabel, onClick: goOngletRoot },
        ...(tabHeader.breadcrumb ?? []),
      ]
    : undefined
  // Description : en descente, celle PROPRE au nœud courant (fournie par le panneau)
  // avec repli sur celle de l'onglet ; à la racine, celle de l'onglet. Jamais vide.
  const headerDescription = inDescent
    ? (tabHeader.description ?? activeItem?.description)
    : activeItem?.description
  // Cluster d'actions : boutons compacts éventuels + bouton « + » mutualisé.
  const headerAction =
    addActions !== undefined || addAction !== null ? (
      <>
        {addActions}
        {addAction !== null && (
          <TooltipIconButton
            icon={<Plus />}
            label={addLabel}
            onClick={addAction}
            disabled={addDisabled}
            variant="outline"
          />
        )}
      </>
    ) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-6 pb-3 sm:px-6 lg:px-8">
        {/* Région live : le changement de contexte (onglet actif ou descente dans
            un onglet) est annoncé aux lecteurs d'écran via le titre courant. */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {headerTitle}
        </div>
        {/* En-tête UNIQUE et partagé avec les autres pages (cf. <PageHeader>) :
            titre = nœud courant en descente, sinon section ; fil « <section> ›
            <onglet> › … » ; `extra` = filtre de périmètre ; `action` = +/actions. */}
        <PageHeader
          title={headerTitle}
          description={headerDescription}
          breadcrumb={headerCrumbs}
          extra={addExtra}
          action={headerAction}
        />

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

        {/* Mobile : menu déroulant des sections (remplace la barre d'onglets sous
            `sm`, où les 5 libellés ne tiennent pas côte à côte ; évite le scroll
            horizontal). La sémantique d'onglets reste portée par la barre desktop ;
            en descente, le fil d'Ariane (PageHeader) assure le « retour racine » que
            le re-clic d'onglet offrait en bureau. Le filtre de périmètre (`extra`)
            n'est plus ici : PageHeader le rend pleine largeur sous le titre. */}
        <div className="flex items-center sm:hidden">
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
        </div>
      </div>

      <TabActionContext.Provider value={api}>
        <TabHeaderContext.Provider value={headerApi}>
          <div
            role="tabpanel"
            id={activeItem ? `panneau-${activeItem.id}` : undefined}
            aria-labelledby={activeItem ? `onglet-${activeItem.id}` : undefined}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8"
          >
            {activeItem?.content}
          </div>
        </TabHeaderContext.Provider>
      </TabActionContext.Provider>
    </div>
  )
}
