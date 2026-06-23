import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PageHeaderCrumb } from './page-header'

export interface TabAddConfig {
  /** Action du bouton +. `null` = pas de bouton (mais `extra`/`actions` peuvent s'afficher). */
  action: (() => void) | null
  /** Libellé de l'action (tooltip + aria-label du bouton +). */
  label: string
  /** Bouton + grisé/non cliquable (mais toujours visible). */
  disabled: boolean
  /** Icône du bouton (défaut : `Plus`). Composant lucide STABLE (réf. de module). */
  icon?: LucideIcon
  /**
   * Contrôle LARGE (ex. filtre de périmètre) : à droite du titre sur bureau, mais
   * replié EN PLEINE LARGEUR sous le titre sur mobile (il occuperait sinon la place
   * du titre). À réserver à UN contrôle large ; pour des boutons icône compacts,
   * voir `actions`.
   */
  extra?: ReactNode
  /**
   * Boutons d'action COMPACTS (icônes : Copier, Modifier, actions de masse…) : ils
   * restent EN HAUT À DROITE à côté du titre et du +, mobile comme bureau. À ne PAS
   * confondre avec `extra` (le filtre large qui, lui, se replie sous le titre).
   */
  actions?: ReactNode
}

export interface TabActionApi {
  setAction: (config: TabAddConfig | null) => void
}

export const TabActionContext = createContext<TabActionApi | null>(null)

/**
 * Enregistre, pour l'onglet actif, l'action « ajouter » (bouton + mutualisé de
 * l'en-tête, avec tooltip `label`), un état `disabled` optionnel, et un éventuel
 * contrôle `extra` affiché à sa gauche. `action: null` sans `extra` masque tout.
 * L'action et l'`extra` doivent être stables (useCallback / useMemo) pour éviter
 * des ré-enregistrements.
 *
 * Hook + contexte volontairement isolés du composant <Tabs> : un module Vite ne
 * doit pas mélanger composant et non-composant (sinon Fast Refresh casse).
 */
export function useTabAddAction(
  action: (() => void) | null,
  label = 'Ajouter',
  opts?: {
    disabled?: boolean
    icon?: LucideIcon
    extra?: ReactNode
    actions?: ReactNode
  },
) {
  const ctx = useContext(TabActionContext)
  const disabled = opts?.disabled ?? false
  const icon = opts?.icon
  const extra = opts?.extra
  const actions = opts?.actions
  useEffect(() => {
    if (!ctx) return
    const hasContent =
      action !== null || extra !== undefined || actions !== undefined
    ctx.setAction(
      hasContent ? { action, label, disabled, icon, extra, actions } : null,
    )
    return () => ctx.setAction(null)
  }, [ctx, action, label, disabled, icon, extra, actions])
}

/**
 * En-tête fourni par l'onglet actif quand on a DESCENDU (catégorie / modèle /
 * gamme ouverte). `<Tabs>` le transforme en `<PageHeader>` : `title` devient le
 * grand titre (le nœud courant), et `breadcrumb` (ancêtres DANS l'onglet, sans
 * préfixe) est précédé par « Bibliothèque › <onglet> » avant d'être rendu sur la
 * ligne discrète au-dessus. À la RACINE de l'onglet, le panneau renvoie `null` :
 * la barre affiche alors le titre de section (prop `title` de <Tabs>), sans fil.
 */
export interface TabHeader {
  /** Titre courant (nœud de descente : nom de catégorie, de modèle, de gamme…). */
  title: string
  /**
   * Ancêtres CLIQUABLES propres à l'onglet (chemin de catégories), SANS le préfixe
   * « Bibliothèque » que <Tabs> ajoute lui-même (et SANS le nom de l'onglet, déjà
   * porté par l'onglet surligné — l'inclure ferait doublon).
   */
  breadcrumb?: PageHeaderCrumb[]
  /**
   * Description PROPRE du nœud courant (catégorie/modèle/gamme), affichée sous le
   * titre. Absente → <Tabs> retombe sur la description de l'onglet (jamais vide).
   */
  description?: string
}

export interface TabHeaderApi {
  setHeader: (header: TabHeader | null) => void
}

export const TabHeaderContext = createContext<TabHeaderApi | null>(null)

/**
 * Enregistre, pour l'onglet actif, l'en-tête de descente (`TabHeader`) rendu par
 * `<Tabs>` via `<PageHeader>`. `null` (ou hook non appelé) → en-tête de section
 * par défaut (titre = prop `title` de <Tabs>, sans fil d'Ariane).
 *
 * L'objet doit être STABLE : l'appelant le mémoïse (useMemo) — sinon il se ré-
 * enregistre à chaque rendu. Même contrat que `useTabAddAction`.
 *
 * Contexte/hook volontairement isolés du composant <Tabs> : un module Vite ne
 * doit pas mélanger composant et non-composant (sinon Fast Refresh casse).
 */
export function useTabHeader(header: TabHeader | null) {
  const ctx = useContext(TabHeaderContext)
  useEffect(() => {
    if (!ctx) return
    ctx.setHeader(header)
    return () => ctx.setHeader(null)
  }, [ctx, header])
}
