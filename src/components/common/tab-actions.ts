import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface TabAddConfig {
  /** Action du bouton +. `null` = pas de bouton (mais `extra`/`actions` peuvent s'afficher). */
  action: (() => void) | null
  /** Libellé de l'action (tooltip + aria-label du bouton +). */
  label: string
  /** Bouton + grisé/non cliquable (mais toujours visible). */
  disabled: boolean
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
  opts?: { disabled?: boolean; extra?: ReactNode; actions?: ReactNode },
) {
  const ctx = useContext(TabActionContext)
  const disabled = opts?.disabled ?? false
  const extra = opts?.extra
  const actions = opts?.actions
  useEffect(() => {
    if (!ctx) return
    const hasContent =
      action !== null || extra !== undefined || actions !== undefined
    ctx.setAction(
      hasContent ? { action, label, disabled, extra, actions } : null,
    )
    return () => ctx.setAction(null)
  }, [ctx, action, label, disabled, extra, actions])
}

export interface TabTitleApi {
  setTitle: (node: ReactNode | null) => void
}

export const TabTitleContext = createContext<TabTitleApi | null>(null)

/**
 * Enregistre, pour l'onglet actif, un NŒUD DE TITRE personnalisé (ex. un fil
 * d'Ariane) rendu à la place du `<h1>` par défaut dans l'en-tête de la barre
 * d'onglets. `null` (ou hook non appelé) → titre par défaut (la prop `title`
 * de <Tabs>). Le nœud peut être interactif (boutons cliquables).
 *
 * Il doit être STABLE : l'appelant le mémoïse (useMemo) — sinon il se ré-
 * enregistre à chaque rendu. Même contrat que `useTabAddAction`.
 *
 * Contexte/hook volontairement isolés du composant <Tabs> : un module Vite ne
 * doit pas mélanger composant et non-composant (sinon Fast Refresh casse).
 */
export function useTabTitle(node: ReactNode | null) {
  const ctx = useContext(TabTitleContext)
  useEffect(() => {
    if (!ctx) return
    ctx.setTitle(node)
    return () => ctx.setTitle(null)
  }, [ctx, node])
}
