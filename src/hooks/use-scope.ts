import { createContext, useContext } from 'react'
import { SCOPE_ALL, SCOPE_COMMUN } from '@/lib/scope'

export interface ScopeContextValue {
  scope: string
  setScope: (scope: string) => void
}

export const ScopeContext = createContext<ScopeContextValue | null>(null)

/**
 * Lit le périmètre PARTAGÉ entre les onglets de la Bibliothèque (fourni par
 * <ScopeProvider>). La valeur choisie dans un onglet est donc conservée quand on
 * change d'onglet.
 *
 * `allowCommun = false` (catalogue à scope SITE strict, sans niveau commun) :
 * « Commun » n'existe pas → présenté/filtré comme « Tout » SANS modifier l'état
 * partagé (préservé pour les autres onglets).
 */
export function useScope(allowCommun = true) {
  const ctx = useContext(ScopeContext)
  if (!ctx) {
    throw new Error('useScope doit être utilisé dans <ScopeProvider>')
  }
  const scope =
    !allowCommun && ctx.scope === SCOPE_COMMUN ? SCOPE_ALL : ctx.scope
  return { scope, setScope: ctx.setScope }
}
