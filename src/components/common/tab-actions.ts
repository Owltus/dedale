import { createContext, useContext, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface TabAddConfig {
  /** Action du bouton +. `null` = pas de bouton (mais `extra` peut s'afficher). */
  action: (() => void) | null
  /** Libellé de l'action (tooltip + aria-label du bouton +). */
  label: string
  /** Bouton + grisé/non cliquable (mais toujours visible). */
  disabled: boolean
  /** Contrôle additionnel affiché à GAUCHE du + (ex. filtre de périmètre). */
  extra?: ReactNode
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
  opts?: { disabled?: boolean; extra?: ReactNode },
) {
  const ctx = useContext(TabActionContext)
  const disabled = opts?.disabled ?? false
  const extra = opts?.extra
  useEffect(() => {
    if (!ctx) return
    const hasContent = action !== null || extra !== undefined
    ctx.setAction(hasContent ? { action, label, disabled, extra } : null)
    return () => ctx.setAction(null)
  }, [ctx, action, label, disabled, extra])
}
